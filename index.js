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
      reactionType: core.getInput("reaction-type"),
      upsert: core.getInput("upsert"),
      upsertId: core.getInput("upsert-id")
    };
    core.debug(`Inputs: ${inspect(inputs)}`);

    const repository = inputs.repository
      ? inputs.repository
      : process.env.GITHUB_REPOSITORY;
    const repo = repository.split("/");
    core.debug(`repository: ${repository}`);

    let editMode = inputs.editMode ? inputs.editMode : "append";
    core.debug(`editMode: ${editMode}`);
    if (!["append", "replace"].includes(editMode)) {
      core.setFailed(`Invalid edit-mode '${editMode}'.`);
      return;
    }

    const octokit = new github.GitHub(inputs.token);

    if (inputs.upsert && inputs.issueNumber && inputs.body) {
      const { data: comments } = await octokit.issues.listComments({
        owner: repo[0],
        repo: repo[1],
        issue_number: inputs.issueNumber,
      });
      const comment = comments.find(comment => {
        if (inputs.upsertId) {
          return comment.body.includes(`upsert-id: ${inputs.upsertId}`)
        }
        return comment.user.login === 'github-actions[bot]'
      })
      if (comment) {
        // Comment to upsert
        inputs.commentId = comment.id
        editMode = "replace"
      }
      if (inputs.upsertId) {
        inputs.body = inputs.body + "\n`upsert-id: " + inputs.upsertId + "`"
      }
    }

    if (inputs.commentId) {
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
        core.setOutput('comment-id', inputs.commentId);
      }

      // Set a comment reaction
      if (inputs.reactionType) {
        await addReaction(octokit, repo, inputs.commentId, inputs.reactionType);
        core.info(`Added reaction '${inputs.reactionType}' to comment id '${inputs.commentId}'.`);
      }
    } else if (inputs.issueNumber) {
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
      core.info(`Created comment id '${comment.id}' on issue '${inputs.issueNumber}'.`);
      core.setOutput('comment-id', comment.id);

      // Set a comment reaction
      if (inputs.reactionType) {
        await addReaction(octokit, repo, comment.id, inputs.reactionType);
        core.info(`Added reaction '${inputs.reactionType}' to comment id '${comment.id}'.`);
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
