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

        console.log(`Processing GitHub event: ${eventName}`);

        switch (eventName) {
            case 'pull_request':
                await handlePullRequestEvent(notion, eventPayload);
                break;
            case 'push':
                await handlePushEvent(notion, eventPayload);
                break;
            default:
                console.log(`Unhandled event type: ${eventName}`);
        }

        console.log('Notion sync completed successfully');

    } catch (error) {
        console.error('Error in Notion sync:', error);
        process.exit(1);
    }
}

async function handlePullRequestEvent(notion, payload) {
    const { action, pull_request } = payload;
    const prNumber = pull_request.number;

    console.log(`PR #${prNumber} - Action: ${action}`);

    const page = await notion.findPageByPRNumber(prNumber);
    if (!page) {
        console.log(`No Notion page found for PR #${prNumber}`);
        return;
    }

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

    console.log(`Push detected to branch: ${branch}`);

    if (branch === 'uat') {
        // Main → UAT merge: Move multiple statuses to UAT
        const statusesToMove = ['Ready for UAT', 'In Dev', 'Failed in Dev'];
        const pages = await notion.findPagesByStatus(statusesToMove);

        console.log(`Moving ${pages.length} items to UAT`);
        await notion.updateMultiplePagesStatus(pages, 'In UAT');

    } else if (branch === 'production') {
        // UAT → Production: Move passed UAT to production
        const pages = await notion.findPagesByStatus(['Passed UAT']);

        console.log(`Moving ${pages.length} items to Production`);
        await notion.updateMultiplePagesStatus(pages, 'Live in Prod');
    }
}

// Run the script
main();