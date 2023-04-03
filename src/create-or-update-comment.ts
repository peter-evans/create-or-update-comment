import * as core from '@actions/core'
import * as github from '@actions/github'

export interface Inputs {
  token: string
  repository: string
  issueNumber: number
  commentId: number
  body: string
  bodyFile: string
  editMode: string
  appendSeparator: string
  reactions: string[]
}

const REACTION_TYPES = [
  '+1',
  '-1',
  'laugh',
  'confused',
  'heart',
  'hooray',
  'rocket',
  'eyes'
]

async function addReactions(
  octokit,
  owner: string,
  repo: string,
  commentId: number,
  reactions: string[]
) {
  const reactionsSet = [
    ...new Set(
      reactions.filter(item => {
        if (!REACTION_TYPES.includes(item)) {
          core.info(`Skipping invalid reaction '${item}'.`)
          return false
        }
        return true
      })
    )
  ]

  if (!reactionsSet) {
    core.setFailed(`No valid reactions are contained in '${reactions}'.`)
    return false
  }

  const results = await Promise.allSettled(
    reactionsSet.map(async item => {
      await octokit.rest.reactions.createForIssueComment({
        owner: owner,
        repo: repo,
        comment_id: commentId,
        content: item
      })
      core.info(`Setting '${item}' reaction on comment.`)
    })
  )

  for (let i = 0, l = results.length; i < l; i++) {
    if (results[i].status === 'fulfilled') {
      core.info(
        `Added reaction '${reactionsSet[i]}' to comment id '${commentId}'.`
      )
    } else if (results[i].status === 'rejected') {
      core.info(
        `Adding reaction '${reactionsSet[i]}' to comment id '${commentId}' failed.`
      )
    }
  }
}

function appendSeparatorTo(body: string, separator: string): string {
  switch (separator) {
    case 'newline':
      return body + '\n'
    case 'space':
      return body + ' '
    default: // none
      return body
  }
}

async function createComment(
  octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string
): Promise<number> {
  const {data: comment} = await octokit.rest.issues.createComment({
    owner: owner,
    repo: repo,
    issue_number: issueNumber,
    body
  })
  core.info(`Created comment id '${comment.id}' on issue '${issueNumber}'.`)
  return comment.id
}

async function updateComment(
  octokit,
  owner: string,
  repo: string,
  commentId: number,
  body: string,
  editMode: string,
  appendSeparator: string
): Promise<number> {
  if (body) {
    let commentBody = ''
    if (editMode == 'append') {
      // Get the comment body
      const {data: comment} = await octokit.rest.issues.getComment({
        owner: owner,
        repo: repo,
        comment_id: commentId
      })
      commentBody = appendSeparatorTo(
        comment.body ? comment.body : '',
        appendSeparator
      )
    }
    commentBody = commentBody + body
    core.debug(`Comment body: ${commentBody}`)
    await octokit.rest.issues.updateComment({
      owner: owner,
      repo: repo,
      comment_id: commentId,
      body: commentBody
    })
    core.info(`Updated comment id '${commentId}'.`)
  }
  return commentId
}

export async function createOrUpdateComment(
  inputs: Inputs,
  body: string
): Promise<void> {
  const [owner, repo] = inputs.repository.split('/')

  const octokit = github.getOctokit(inputs.token)

  const commentId = inputs.commentId
    ? await updateComment(
        octokit,
        owner,
        repo,
        inputs.commentId,
        body,
        inputs.editMode,
        inputs.appendSeparator
      )
    : await createComment(octokit, owner, repo, inputs.issueNumber, body)

  core.setOutput('comment-id', commentId)
  if (inputs.reactions) {
    await addReactions(octokit, owner, repo, commentId, inputs.reactions)
  }
}
