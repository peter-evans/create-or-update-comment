import * as core from '@actions/core'
import * as github from '@actions/github'
import {readFileSync} from 'fs'

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

function getBody(inputs) {
  if (inputs.body) {
    return inputs.body
  } else if (inputs.bodyFile) {
    return readFileSync(inputs.bodyFile, 'utf-8')
  } else {
    return ''
  }
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

function appendSeparator(body: string, separator: string): string {
  switch (separator) {
    case 'newline':
      return body + '\n'
    case 'space':
      return body + ' '
    default: // none
      return body
  }
}

export async function createOrUpdateComment(inputs: Inputs): Promise<void> {
  const [owner, repo] = inputs.repository.split('/')
  const body = getBody(inputs)

  const octokit = github.getOctokit(inputs.token)

  if (inputs.commentId) {
    // Edit a comment
    if (!body && !inputs.reactions) {
      core.setFailed("Missing comment 'body', 'body-file', or 'reactions'.")
      return
    }

    if (body) {
      let commentBody = ''
      if (inputs.editMode == 'append') {
        // Get the comment body
        const {data: comment} = await octokit.rest.issues.getComment({
          owner: owner,
          repo: repo,
          comment_id: inputs.commentId
        })
        commentBody = appendSeparator(
          comment.body ? comment.body : '',
          inputs.appendSeparator
        )
      }

      commentBody = commentBody + body
      core.debug(`Comment body: ${commentBody}`)
      await octokit.rest.issues.updateComment({
        owner: owner,
        repo: repo,
        comment_id: inputs.commentId,
        body: commentBody
      })
      core.info(`Updated comment id '${inputs.commentId}'.`)
      core.setOutput('comment-id', inputs.commentId)
    }

    // Set comment reactions
    if (inputs.reactions) {
      await addReactions(
        octokit,
        owner,
        repo,
        inputs.commentId,
        inputs.reactions
      )
    }
  } else if (inputs.issueNumber) {
    // Create a comment
    if (!body) {
      core.setFailed("Missing comment 'body' or 'body-file'.")
      return
    }

    const {data: comment} = await octokit.rest.issues.createComment({
      owner: owner,
      repo: repo,
      issue_number: inputs.issueNumber,
      body
    })
    core.info(
      `Created comment id '${comment.id}' on issue '${inputs.issueNumber}'.`
    )
    core.setOutput('comment-id', comment.id)

    // Set comment reactions
    if (inputs.reactions) {
      await addReactions(octokit, owner, repo, comment.id, inputs.reactions)
    }
  } else {
    core.setFailed("Missing either 'issue-number' or 'comment-id'.")
    return
  }
}
