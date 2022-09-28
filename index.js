const { inspect } = require("util");
const core = require("@actions/core");
const github = require("@actions/github");


// const HIDE_REASONS = [
//   "off topic",
//   "outdated",
//   "resolved",
//   "spam",
//   "abuse",
//   "dublicated",
// ];

async function run() {
  try {
    const inputs = {
      token: core.getInput("token"),
      issueNumber: core.getInput("issue_number"),
      body: core.getInput("body"),
      hideReason: core.getInput("reason"),
    };
    core.debug(`Inputs: ${inspect(inputs)}`);

    // const repository = inputs.repository
    //   ? inputs.repository
    //   : process.env.GITHUB_REPOSITORY;
    // const repo = repository.split("/");
    // core.debug(`repository: ${repository}`);

    // const octokit = github.getOctokit(inputs.token);

    console.log(inputs.body);
    if (inputs.body) {

      console.log(`Hello ${inputs.issueNumber}!`);

      console.log(`Hello ${inputs.nameToGreet2}!`);

      console.log(`Hello ${inputs.nameToGreet3}!`);

      await new Promise((resolve) => setTimeout(resolve, 120000));

      const payload = JSON.stringify(github.context.payload, undefined, 2);
      console.log(`The event payload: ${payload}`);
      
      // Hide comments
      // const { data: comments } = await octokit.rest.issues.listComments({
      //   owner: repo[0],
      //   repo: repo[1],
      //   issue_number: inputs.issueNumber,
      // });
      // core.info(`Found ${comments} comments.`);
      // core.warning(`Found ${comments} comments.`);
      // console.log(comments, comments.length);
      // for (let i = 0, l = comments.length; i < l; i++) {
      //   if (comments[i].body.includes(inputs.body)) {
      //     await octokit.rest.issues.hideComments({
      //       owner: repo[0],
      //       repo: repo[1],
      //       comment_id: comments[i].id,
      //       reason: HIDE_REASONS.includes(inputs.hideReason.toLowerCase) ? inputs.hideReason : "Outdated",
      //     });
      //     core.info(`Hidden comment id '${comments[i].id}'.`);
      //   }
      // }
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

run();
