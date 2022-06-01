const { inspect } = require("util");
const { readFileSync, existsSync } = require("fs");
const core = require("@actions/core");
const github = require("@actions/github");

const REACTION_TYPES = [
  "+1",
  "-1",
  "laugh",
  "confused",
  "heart",
  "hooray",
  "rocket",
  "eyes",
];

async function addReactions(octokit, repo, comment_id, reactions) {
  let ReactionsSet = [
    ...new Set(
      reactions
        .replace(/\s/g, "")
        .split(",")
        .filter((item) => {
          if (!REACTION_TYPES.includes(item)) {
            core.info(`Skipping invalid reaction '${item}'.`);
            return false;
          }
          return true;
        })
    ),
  ];

  if (!ReactionsSet) {
    core.setFailed(
      `No valid reactions are contained in '${reactions}'.`
    );
    return false;
  }

  let results = await Promise.allSettled(
    ReactionsSet.map(async (item) => {
      await octokit.rest.reactions.createForIssueComment({
        owner: repo[0],
        repo: repo[1],
        comment_id: comment_id,
        content: item,
      });
      core.info(`Setting '${item}' reaction on comment.`);
    })
  );

  for (let i = 0, l = results.length; i < l; i++) {
    if (results[i].status === "fulfilled") {
      core.info(
        `Added reaction '${ReactionsSet[i]}' to comment id '${comment_id}'.`
      );
    } else if (results[i].status === "rejected") {
      core.info(
        `Adding reaction '${ReactionsSet[i]}' to comment id '${comment_id}' failed with ${results[i].reason}.`
      );
    }
  }
  ReactionsSet = undefined;
  results = undefined;
}

async function run() {
  try {
    const inputs = {
      token: core.getInput("token"),
      repository: core.getInput("repository"),
      issueNumber: core.getInput("issue-number"),
      commentId: core.getInput("comment-id"),
      body: core.getInput("body"),
      file: core.getInput("file"),
      fileEncoding: core.getInput("file-encoding") || 'utf8',
      editMode: core.getInput("edit-mode"),
      reactions: core.getInput("reactions")
        ? core.getInput("reactions")
        : core.getInput("reaction-type"),
    };
    core.debug(`Inputs: ${inspect(inputs)}`);

    const repository = inputs.repository
      ? inputs.repository
      : process.env.GITHUB_REPOSITORY;
    const repo = repository.split("/");
    core.debug(`repository: ${repository}`);

    const editMode = inputs.editMode ? inputs.editMode : "append";
    core.debug(`editMode: ${editMode}`);
    if (!["append", "replace"].includes(editMode)) {
      core.setFailed(`Invalid edit-mode '${editMode}'.`);
      return;
    }

    if (inputs.file && inputs.body) {
      core.setFailed("Only one of 'file' or 'body' can be set.");
      return;
    }

    if (inputs.file) {
      if (!existsSync(inputs.file)) {
        core.setFailed(`File '${inputs.file}' does not exist.`);
        return;
      }
    }

    const octokit = github.getOctokit(inputs.token);

    if (inputs.commentId) {
      // Edit a comment
      if (!inputs.body && !inputs.reactions && !inputs.file) {
        core.setFailed("Missing either comment 'body', 'file', or 'reactions'.");
        return;
      }

      const body = getBodyOrFile(inputs);

      if (body) {
        var commentBody = "";
        if (editMode == "append") {
          // Get the comment body
          const { data: comment } = await octokit.rest.issues.getComment({
            owner: repo[0],
            repo: repo[1],
            comment_id: inputs.commentId,
          });
          commentBody = comment.body + "\n";
        }

        commentBody = commentBody + body;
        core.debug(`Comment body: ${commentBody}`);
        await octokit.rest.issues.updateComment({
          owner: repo[0],
          repo: repo[1],
          comment_id: inputs.commentId,
          body: commentBody,
        });
        core.info(`Updated comment id '${inputs.commentId}'.`);
        core.setOutput("comment-id", inputs.commentId);
      }

      // Set comment reactions
      if (inputs.reactions) {
        await addReactions(octokit, repo, inputs.commentId, inputs.reactions);
      }
    } else if (inputs.issueNumber) {
      // Create a comment
      const body = getBodyOrFile(inputs);

      if (!body) {
        core.setFailed("Missing comment 'body' or 'file'.");
        return;
      }

      const { data: comment } = await octokit.rest.issues.createComment({
        owner: repo[0],
        repo: repo[1],
        issue_number: inputs.issueNumber,
        body,
      });
      core.info(
        `Created comment id '${comment.id}' on issue '${inputs.issueNumber}'.`
      );
      core.setOutput("comment-id", comment.id);

      // Set comment reactions
      if (inputs.reactions) {
        await addReactions(octokit, repo, comment.id, inputs.reactions);
      }
    } else {
      core.setFailed("Missing either 'issue-number' or 'comment-id'.");
      return;
    }
  } catch (error) {
    core.debug(inspect(error));
    core.setFailed(error.message);
    if (error.message == 'Resource not accessible by integration') {
      core.error(`See this action's readme for details about this error`);
    }
  }
}

function getBodyOrFile (inputs) {
  if (inputs.body) {
    return inputs.body;
  } else if (inputs.file) {
    return readFileSync(inputs.file, inputs.fileEncoding);
  }
}

run();
