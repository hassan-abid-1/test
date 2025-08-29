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
    const branchName = pull_request.head.ref; // Source branch
    const prTitle = pull_request.title;

    console.log(`🔍 PR from branch: ${branchName}`);
    console.log(`📝 PR Title: ${prTitle}`);
    console.log(`🎯 Action: ${action}`);

    // Extract ticket ID from branch name (feature/ticket-name)
    const ticketId = extractTicketIdFromBranch(branchName);
    console.log(`🎫 Extracted Ticket ID: ${ticketId}`);

    // Try to find Notion page by branch name first, then by ticket ID
    let page = await notion.findPageByBranchName(branchName);
    if (!page && ticketId) {
        page = await notion.findPageByTicketId(ticketId);
    }

    if (!page) {
        console.log(`❌ No Notion page found for branch "${branchName}" or ticket "${ticketId}"`);
        console.log('💡 Create a Notion page with:');
        console.log(`   - Branch Name: ${branchName}`);
        console.log(`   - Ticket ID: ${ticketId}`);
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
            }
            break;

        case 'ready_for_review':
            await notion.updatePageStatus(page.id, 'In Code Review');
            break;
    }
}

async function handlePushEvent(notion, payload) {
    const { ref, commits } = payload;
    const branch = ref.replace('refs/heads/', '');

    console.log(`🚀 Push detected to branch: ${branch}`);
    console.log(`📦 Commits: ${commits.length}`);

    if (branch === 'uat') {
        // Main → UAT merge
        const statusesToMove = ['Ready for UAT', 'In Dev', 'Failed in Dev'];
        const pages = await notion.findPagesByStatus(statusesToMove);

        await notion.updateMultiplePagesStatus(pages, 'In UAT');

    } else if (branch === 'production') {
        // UAT → Production merge
        const pages = await notion.findPagesByStatus(['Passed UAT']);

        await notion.updateMultiplePagesStatus(pages, 'Live in Prod');
    }
}

function extractTicketIdFromBranch(branchName) {
    // Extract ticket ID from branch name patterns:
    // feature/new-auth → new-auth
    // feature/ABC-123 → ABC-123
    // fix/login-issue → login-issue

    const patterns = [
        /^feature\/(.+)$/,
        /^fix\/(.+)$/,
        /^hotfix\/(.+)$/,
        /^bugfix\/(.+)$/
    ];

    for (const pattern of patterns) {
        const match = branchName.match(pattern);
        if (match) {
            return match[1]; // Return the part after the prefix
        }
    }

    return branchName; // Return full branch name if no pattern matched
}

// Run the script
main();