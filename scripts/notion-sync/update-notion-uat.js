const { NotionClient } = require('./notion-client');
const fs = require('fs');

async function main() {
    try {
        const notion = new NotionClient(process.env.NOTION_API_KEY, process.env.NOTION_DATABASE_ID);
        const eventPayload = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
        const eventName = process.env.GITHUB_EVENT_NAME;

        if (eventName !== 'pull_request') {
            console.log(`⚠️ Not handling event: ${eventName}`);
            return;
        }

        const { action, pull_request } = eventPayload;
        const targetBranch = pull_request.base.ref;

        if (targetBranch.toLowerCase() !== 'uat') {
            console.log(`⏭️ Skipping PR not targeting uat (target=${targetBranch})`);
            return;
        }

        const assignees = pull_request.assignees.map(a => a.login);
        if (assignees.length === 0) {
            console.log('⚠️ No assignees on PR, cannot link tickets');
            return;
        }

        console.log(`👥 PR assignees: ${assignees.join(', ')}`);

        const candidateStatuses = ['In Dev', 'Failed in Dev', 'Ready for UAT'];
        let allTickets = [];

        for (const assignee of assignees) {
            const assigneeEmail = await mapGithubLoginToEmail(assignee);
            if (!assigneeEmail) {
                console.log(`⚠️ No email mapping found for GitHub user: ${assignee}`);
                continue;
            }
            const tickets = await notion.findPagesByStatusAndAssignee(candidateStatuses, assigneeEmail);
            allTickets.push(...tickets);
        }

        const uniqueTickets = [...new Map(allTickets.map(t => [t.id, t])).values()];

        console.log(`📌 Found ${uniqueTickets.length} candidate tickets for PR`);

        if (action === 'opened') {
            console.log(`🔗 Tickets linked to PR: ${uniqueTickets.map(t => t.id).join(', ')}`);
        }

        if (action === 'closed' && pull_request.merged) {
            console.log(`✅ PR merged → transitioning tickets to In UAT`);
            await notion.updateMultiplePagesStatus(uniqueTickets, 'In UAT');
        }
    } catch (err) {
        console.error('❌ Error in Notion UAT sync:', err);
        process.exit(1);
    }
}

// ⚠️ Replace with your real GitHub login → email mapping
async function mapGithubLoginToEmail(login) {
    const mapping = {
        'alice-dev': 'alice@company.com',
        'bob-dev': 'bob@company.com'
    };
    return mapping[login] || null;
}

main();