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

        // Inspect the database schema first for debugging
        await notion.inspectDatabaseSchema();

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

    // Try both full branch-based task ID and numeric extraction
    const taskIdFromBranch = extractTaskIdFromBranch(branchName);
    const numericTaskId = extractTaskIdNumberFromBranch(branchName);

    console.log(`🎫 Full Task ID from branch: ${taskIdFromBranch}`);
    console.log(`🔢 Numeric Task ID from branch: ${numericTaskId}`);

    // Try to find page with different task ID formats
    let page = null;

    // First try with full task ID (e.g., "TES-76S-2")
    if (taskIdFromBranch) {
        page = await notion.findPageByTaskId(taskIdFromBranch);
    }

    // If not found, try with numeric ID (e.g., 2)
    if (!page && numericTaskId) {
        console.log(`⚡ Trying with numeric Task ID: ${numericTaskId}`);
        page = await notion.findPageByTaskId(numericTaskId);
    }

    // If still not found, try with the last part after dash (e.g., "2" from "TES-76S-2")
    if (!page && taskIdFromBranch && taskIdFromBranch.includes('-')) {
        const lastPart = taskIdFromBranch.split('-').pop();
        if (lastPart && /^\d+$/.test(lastPart)) {
            console.log(`⚡ Trying with last numeric part: ${lastPart}`);
            page = await notion.findPageByTaskId(parseInt(lastPart));
        }
    }

    if (!page) {
        console.log(`❌ No Notion page found with any Task ID format from branch: ${branchName}`);
        console.log(`💡 Tried: ${taskIdFromBranch}, ${numericTaskId}`);
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
    // Extract the full task ID from branch name
    // feature/TES-76S-2 → "TES-76S-2"
    // feature/GEN-5694 → "GEN-5694"
    // feature/123 → "123"

    const patterns = [
        // Match feature/TASK-ID-NUMBER or similar
        /^(?:feature|fix|hotfix|bugfix|chore|docs|style|refactor|test|release)\/([A-Z]+-[A-Z0-9]+-\d+)$/i,
        // Match feature/TASK-NUMBER
        /^(?:feature|fix|hotfix|bugfix|chore|docs|style|refactor|test|release)\/([A-Z]+-\d+)$/i,
        // Match feature/NUMBER
        /^(?:feature|fix|hotfix|bugfix|chore|docs|style|refactor|test|release)\/(\d+)$/i,
        // Match anything after the prefix
        /^(?:feature|fix|hotfix|bugfix|chore|docs|style|refactor|test|release)\/(.+)$/i
    ];

    for (const pattern of patterns) {
        const match = branchName.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }
    return null;
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