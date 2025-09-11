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

        // ✅ Extract PR assignees (GitHub login or display name)
        const prAssignees = (pull_request.assignees || [])
            .map(a => a.login || a.name || '')
            .map(n => n.toLowerCase());
        console.log(`👥 PR assignees: ${prAssignees.join(', ')}`);

        // ✅ Allowed Notion names
        const allowedNames = ['Mel', 'Lisa', 'Zaid', 'Hassan'];

        // Candidate statuses to transition from
        const candidateStatuses = ['In Dev', 'Failed in Dev', 'Ready for UAT'];

        // Get all tickets with candidate statuses
        const allTickets = await notion.findPagesByStatus(candidateStatuses);

        // ✅ Filter tickets where Notion assignee name matches PR assignee
        const matchingTickets = allTickets.filter(ticket => {
            const assignees = ticket.properties?.Assignee?.people || [];
            const notionNames = assignees.map(p => (p.name || '').toLowerCase());

            return notionNames.some(notionName => {
                if (!allowedNames.map(n => n.toLowerCase()).includes(notionName)) return false;
                return prAssignees.some(pa => pa.includes(notionName) || notionName.includes(pa));
            });
        });

        console.log(`📌 Found ${matchingTickets.length} candidate tickets linked to PR`);

        if (action === 'opened') {
            console.log(`🔗 Tickets linked: ${matchingTickets.map(t => t.id).join(', ')}`);
        }

        if (action === 'closed' && pull_request.merged) {
            console.log(`✅ PR merged → transitioning tickets to In UAT`);
            await notion.updateMultiplePagesStatus(matchingTickets, 'In UAT');
        }
    } catch (err) {
        console.error('❌ Error in Notion UAT sync:', err);
        process.exit(1);
    }
}

main();
