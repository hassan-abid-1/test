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
    const targetBranch = pull_request.base.ref;

    console.log(`🔍 PR from branch: ${branchName} → ${targetBranch}`);
    console.log(`🎯 Action: ${action}`);

    // Skip status updates for deployment PRs (any branch→uat, any branch→production)
    const deploymentBranches = ['uat', 'production'];
    if (deploymentBranches.includes(targetBranch)) {
        console.log(`⏭️  Skipping status update - this is a deployment PR to ${targetBranch}`);
        console.log(`💡 Deployment PRs don't change individual story statuses`);
        return;
    }

    // Only process PRs targeting dev or development branches
    const developmentBranches = ['dev', 'development'];
    if (!developmentBranches.includes(targetBranch)) {
        console.log(`⏭️  Skipping status update - target branch ${targetBranch} is not a development branch`);
        return;
    }

    // Extract numeric task ID from branch name
    const numericTaskId = extractTaskIdNumberFromBranch(branchName);

    console.log(`🔢 Numeric Task ID from branch: ${numericTaskId}`);

    if (!numericTaskId) {
        console.log(`❌ No numeric Task ID found in branch: ${branchName}`);
        console.log(`💡 Name branch like: feature/123 or feature/TEST-456`);
        return;
    }

    const page = await notion.findPageByTaskId(numericTaskId);

    if (!page) {
        console.log(`❌ No Notion page found with Task ID: ${numericTaskId}`);
        return;
    }

    console.log(`✅ Found Notion page: ${page.id}`);

    // Update status based on PR action (only for feature PRs to dev/development)
    switch (action) {
        case 'opened':
            console.log(`📝 Feature PR opened to ${targetBranch} - moving to "In Progress"`);
            await notion.updatePageStatus(page.id, 'In Progress');
            break;

        case 'review_requested':
            console.log(`👀 Code reviewer assigned - moving to "In Code Review"`);
            await notion.updatePageStatus(page.id, 'In Code Review');
            break;

        case 'closed':
            if (pull_request.merged) {
                console.log(`🎉 PR merged to ${targetBranch} - moving to "In Dev"`);
                await notion.updatePageStatus(page.id, 'In Dev');
            } else {
                console.log(`❌ PR closed without merge - no status change`);
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

    if (branch === 'uat') {
        console.log(`🔄 Deployment merged to UAT - moving stories from "Ready for UAT", "In Dev", "Failed in Dev" to "In UAT"`);
        const statusesToMove = ['Ready for UAT', 'In Dev', 'Failed in Dev'];
        const pages = await notion.findPagesByStatus(statusesToMove);

        if (pages.length > 0) {
            await notion.updateMultiplePagesStatus(pages, 'In UAT');
        } else {
            console.log(`ℹ️ No pages found with statuses: ${statusesToMove.join(', ')}`);
        }

    } else if (branch === 'production') {
        console.log(`🔄 Deployment merged to Production - moving stories from "Passed UAT" to "Live in Prod"`);
        const pages = await notion.findPagesByStatus(['Passed UAT']);

        if (pages.length > 0) {
            await notion.updateMultiplePagesStatus(pages, 'Live in Prod');
        } else {
            console.log(`ℹ️ No pages found with status: Passed UAT`);
        }

    } else if (branch === 'dev' || branch === 'development') {
        console.log(`ℹ️ Push to ${branch} branch - no bulk status changes (individual feature PRs handle story status)`);

    } else {
        console.log(`ℹ️ Push to ${branch} - no status changes configured for this branch`);
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