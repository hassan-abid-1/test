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

    const deploymentBranches = ['uat', 'production'];
    if (deploymentBranches.includes(targetBranch)) {
        console.log(`⏭️ Skipping status update - deployment PR to ${targetBranch}`);
        return;
    }

    const developmentBranches = ['dev', 'development'];
    if (!developmentBranches.includes(targetBranch)) {
        console.log(`⏭️ Skipping - target branch ${targetBranch} is not a dev branch`);
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
            } else {
                console.log(`❌ PR closed without merge - no status change`);
            }
            break;
        default:
            console.log(`⚠️ Unhandled PR action: ${action}`);
    }
}

async function handlePushEvent(notion, payload) {
    const { ref, pusher } = payload;
    const branch = ref.replace('refs/heads/', '');
    const assigneeEmail = pusher?.email || null;

    console.log(`🚀 Push detected to branch: ${branch}`);
    console.log(`👤 Pusher: ${assigneeEmail || 'Unknown'}`);

    if (branch === 'uat') {
        const statusesToMove = ['In Dev', 'Failed in Dev', 'Ready for UAT'];
        await moveFeatureTickets(notion, assigneeEmail, statusesToMove, 'In UAT');
    } else if (branch === 'production') {
        const statusesToMove = ['In UAT', 'Passed UAT'];
        await moveFeatureTickets(notion, assigneeEmail, statusesToMove, 'Live in Prod');
    } else if (branch === 'dev' || branch === 'development') {
        console.log(`ℹ️ Push to ${branch} - no bulk status changes`);
    } else {
        console.log(`ℹ️ Push to ${branch} - no status changes configured`);
    }
}

async function moveFeatureTickets(notion, assigneeEmail, statuses, newStatus) {
    if (!assigneeEmail) {
        console.log(`⚠️ No assignee email found, skipping ${newStatus}`);
        return;
    }

    console.log(`🔄 Looking for ${assigneeEmail}'s tickets in statuses: ${statuses.join(', ')}`);

    const pages = await notion.findPagesByStatusAndAssignee(statuses, assigneeEmail);
    const featurePages = filterFeatureRelatedPages(pages);

    if (featurePages.length === 0) {
        console.log(`ℹ️ No feature-related tickets found for ${assigneeEmail}`);
        return;
    }

    console.log(`📊 Updating ${featurePages.length} tickets for ${assigneeEmail} → ${newStatus}`);
    await notion.updateMultiplePagesStatus(featurePages, newStatus);
}

function filterFeatureRelatedPages(pages) {
    return pages.filter(page => {
        const title = page.properties.Title?.title?.[0]?.plain_text || '';
        const branchName = page.properties['Branch Name']?.rich_text?.[0]?.plain_text || '';

        const hasFeatureReference =
            title.toLowerCase().includes('feature/') ||
            branchName.toLowerCase().includes('feature/');

        if (hasFeatureReference) {
            console.log(`✅ Including feature ticket: ${title}`);
            return true;
        } else {
            console.log(`⏭️ Skipping non-feature ticket: ${title}`);
            return false;
        }
    });
}

function extractTaskIdNumberFromBranch(branchName) {
    const matches = branchName.match(/(\d+)/g);
    return matches ? parseInt(matches[matches.length - 1]) : null;
}

main();
