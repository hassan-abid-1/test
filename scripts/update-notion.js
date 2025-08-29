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

    console.log(`🔍 PR from branch: ${branchName}`);
    console.log(`🎯 Action: ${action}`);

    const taskId = extractTaskIdFromBranch(branchName);

    if (!taskId) {
        console.log(`❌ No Task ID found in branch: ${branchName}`);
        console.log('💡 Name branch like: feature/task-123');
        return;
    }

    console.log(`🎫 Extracted Task ID: ${taskId}`);

    const page = await notion.findPageByTaskId(taskId);

    if (!page) {
        console.log(`❌ No Notion page found with Task ID: ${taskId}`);
        return;
    }

    console.log(`✅ Found Notion page: ${page.id}`);

    // Update status based on PR action
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
            }
            break;
    }
}

async function handlePushEvent(notion, payload) {
    const { ref } = payload;
    const branch = ref.replace('refs/heads/', '');

    console.log(`🚀 Push detected to branch: ${branch}`);

    if (branch === 'uat') {
        const statusesToMove = ['Ready for UAT', 'In Dev', 'Failed in Dev'];
        const pages = await notion.findPagesByStatus(statusesToMove);
        await notion.updateMultiplePagesStatus(pages, 'In UAT');

    } else if (branch === 'production') {
        const pages = await notion.findPagesByStatus(['Passed UAT']);
        await notion.updateMultiplePagesStatus(pages, 'Live in Prod');
    }
}

function extractTaskIdFromBranch(branchName) {
    const patterns = [
        /^(feature|fix|hotfix|bugfix|chore|docs|style|refactor|test|release)\/([a-zA-Z_-]*\d+)$/i,
        /^(feature|fix|hotfix|bugfix|chore|docs|style|refactor|test|release)\/([a-zA-Z_-]*\d+)-([a-z0-9]+)$/i
    ];

    for (const pattern of patterns) {
        const match = branchName.match(pattern);
        if (match) {
            return match[2];
        }
    }
    return null;
}

// Run the script
main();