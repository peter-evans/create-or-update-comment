const { inspect } = require("util");
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
  "eyes"
];

async function addReaction(octokit, repo, comment_id, reactionType) {
  if (REACTION_TYPES.includes(reactionType)) {
    await octokit.reactions.createForIssueComment({
      owner: repo[0],
      repo: repo[1],
      comment_id: comment_id,
      content: reactionType
    });
    core.info(`Set '${reactionType}' reaction on comment.`);
  } else {
    core.setFailed("Invalid 'reaction-type'.");
    return;
  }
}

async function run() {
  try {
    const inputs = {
      token: core.getInput("token"),
      repository: core.getInput("repository"),
      issueNumber: core.getInput("issue-number"),
      commentId: core.getInput("comment-id"),
      body: core.getInput("body"),
      editMode: core.getInput("edit-mode"),
      reactionType: core.getInput("reaction-type")
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

    const octokit = new github.GitHub(inputs.token);

    if (inputs.issueNumber) {
      // Create a comment
      if (!inputs.body) {
        core.setFailed("Missing comment 'body'.");
        return;
      }
      const { data: comment } = await octokit.issues.createComment({
        owner: repo[0],
        repo: repo[1],
        issue_number: inputs.issueNumber,
        body: inputs.body
      });
      core.info(`Created comment on issue '${inputs.issueNumber}'.`);

      // Set a comment reaction
      if (inputs.reactionType) {
        await addReaction(octokit, repo, comment.id, inputs.reactionType);
      }
    } else if (inputs.commentId) {
      // Edit a comment
      if (!inputs.body && !inputs.reactionType) {
        core.setFailed("Missing either comment 'body' or 'reaction-type'.");
        return;
      }

      if (inputs.body) {
        var commentBody = "";
        if (editMode == "append") {
          // Get the comment body
          const { data: comment } = await octokit.issues.getComment({
            owner: repo[0],
            repo: repo[1],
            comment_id: inputs.commentId
          });
          commentBody = comment.body + "\n";
        }

        commentBody = commentBody + inputs.body;
        core.debug(`Comment body: ${commentBody}`);
        await octokit.issues.updateComment({
          owner: repo[0],
          repo: repo[1],
          comment_id: inputs.commentId,
          body: commentBody
        });
        core.info(`Updated comment id '${inputs.commentId}'.`);
      }

      // Set a comment reaction
      if (inputs.reactionType) {
        await addReaction(octokit, repo, inputs.commentId, inputs.reactionType);
      }
    } else {
      core.setFailed("Missing either 'issue-number' or 'comment-id'.");
      return;
    }
  } catch (error) {
    core.debug(inspect(error));
    core.setFailed(error.message);
  }
}

run();
