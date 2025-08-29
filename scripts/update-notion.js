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

    const taskIdNumber = extractTaskIdNumberFromBranch(branchName);

    if (!taskIdNumber) {
        console.log(`❌ No numeric Task ID found in branch: ${branchName}`);
        console.log('💡 Name branch like: feature/123 or feature/TEST-456');
        return;
    }

    console.log(`🎫 Extracted numeric Task ID: ${taskIdNumber}`);

    const page = await notion.findPageByTaskId(taskIdNumber);

    if (!page) {
        console.log(`❌ No Notion page found with Task ID: ${taskIdNumber}`);
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

function extractTaskIdNumberFromBranch(branchName) {
    // Extract only the numeric part from the branch name
    // feature/TES-76S-2 → extracts "2" (last number)
    // feature/GEN-5694 → extracts "5694"
    // feature/123 → extracts "123"

    const patterns = [
        /^(feature|fix|hotfix|bugfix|chore|docs|style|refactor|test|release)\/(?:.*-)?(\d+)$/i,
        /^(feature|fix|hotfix|bugfix|chore|docs|style|refactor|test|release)\/(?:.*)?(\d+)/i
    ];

    for (const pattern of patterns) {
        const match = branchName.match(pattern);
        if (match && match[2]) {
            return parseInt(match[2]);
        }
    }
    return null;
}

// Run the script
main();