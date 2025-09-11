const { NotionClient } = require('./notion-client');
const fs = require('fs');

async function main() {
    try {
        const notionApiKey = process.env.NOTION_API_KEY;
        const notionDatabaseId = process.env.NOTION_DATABASE_ID;
        const eventPath = process.env.GITHUB_EVENT_PATH;

        if (!notionApiKey || !notionDatabaseId) {
            throw new Error('Missing Notion API credentials');
        }

        const notion = new NotionClient(notionApiKey, notionDatabaseId);

        const eventPayload = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
        const eventName = process.env.GITHUB_EVENT_NAME;

        console.log(`📋 Processing GitHub event: ${eventName}`);

        switch (eventName) {
            case 'pull_request':
                await handlePullRequestEvent(notion, eventPayload);
                break;
            case 'push':
                await handlePushEvent(notion, eventPayload);
                break;
            default:
                console.log(`⚠️ Unhandled event type: ${eventName}`);
        }

        console.log('✅ Notion sync completed successfully');
    } catch (error) {
        console.error('❌ Error in Notion sync:', error);
        process.exit(1);
    }
}

async function handlePullRequestEvent(notion, payload) {
    const { action, pull_request } = payload;
    const branchName = pull_request.head.ref;
    const targetBranch = pull_request.base.ref;

    console.log(`🔍 PR from branch: ${branchName} → ${targetBranch}`);
    console.log(`🎯 Action: ${action}`);

    // Track dev, development, and main (case-insensitive)
    const trackedBranches = ['dev', 'development', 'main'];
    if (!trackedBranches.includes(targetBranch.toLowerCase())) {
        console.log(`⏭️ Skipping - target branch ${targetBranch} is not tracked`);
        return;
    }

    const numericTaskId = extractTaskIdNumberFromBranch(branchName);
    console.log(`🔢 Numeric Task ID from branch: ${numericTaskId}`);

    if (!numericTaskId) {
        console.log(`❌ No Task ID found in branch: ${branchName}`);
        return;
    }

    const page = await notion.findPageByTaskId(numericTaskId);
    if (!page) {
        console.log(`❌ No Notion page found with Task ID: ${numericTaskId}`);
        return;
    }

    console.log(`✅ Found Notion page: ${page.id}`);

    switch (action) {
        case 'opened':
            await notion.updatePageStatus(page.id, 'In Progress');
            break;
        case 'review_requested':
            await notion.updatePageStatus(page.id, 'In Code Review');
            break;
        case 'closed':
            if (pull_request.merged) {
                await notion.updatePageStatus(page.id, 'In Dev');
                console.log(`✅ Task ${numericTaskId} marked as 'In Dev' after successful merge`);
            } else {
                console.log(`ℹ️ PR closed without merge - no status change applied`);
            }
            break;
        default:
            console.log(`⚠️ Unhandled PR action: ${action}`);
    }
}

async function handlePushEvent(notion, payload) {
    const { ref } = payload;
    const branch = ref.replace('refs/heads/', '');

    console.log(`🚀 Push detected to branch: ${branch}`);

    const trackedBranches = ['dev', 'development', 'main'];
    if (trackedBranches.includes(branch.toLowerCase())) {
        console.log(`ℹ️ Direct push to ${branch} detected`);
        console.log(`⏭️ No automatic status changes for direct pushes to ${branch}`);
    } else {
        console.log(`ℹ️ Push to ${branch} - no status changes configured for this branch`);
    }
}

function extractTaskIdNumberFromBranch(branchName) {
    // Allow approved prefixes (case-insensitive)
    const approvedPrefixes = ['feature', 'bugfix', 'hotfix', 'chore', 'fix', 'feat'];
    const prefixPattern = `(?:${approvedPrefixes.join('|')})`;

    // Pattern: prefix/PROJECTKEY-1234-description
    const pattern = new RegExp(`^${prefixPattern}\\/(?:[A-Z]+-)?(\\d+)`, 'i');

    const match = branchName.match(pattern);
    if (match && match[1]) {
        return parseInt(match[1]);
    }

    console.log(`❌ Branch "${branchName}" does not match approved prefix pattern`);
    return null;
}

main();