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

        if (targetBranch.toLowerCase() !== 'prod') {
            console.log(`⏭️ Skipping PR not targeting prod (target=${targetBranch})`);
            return;
        }

        // ✅ Extract PR assignees
        const prAssignees = (pull_request.assignees || []).map(a => a.login || '').map(n => n.toLowerCase());
        console.log(`👥 PR assignees: ${prAssignees.join(', ')}`);

        // ✅ GitHub → Notion mapping
        const loginToNotionName = {
            'hassan-abid-1': 'Hassan Abid',
            'zahratariq-96': 'Zahra Tariq',
            'melcantwell27': 'melanie cantwell',
            'beachsideproperty': 'Lisa',
            'zaid-shabbir-ui': 'Zaid Shabbir'
        };

        prAssignees.forEach(login => {
            const mappedName = loginToNotionName[login];
            if (mappedName) {
                console.log(`🔗 GitHub assignee "${login}" → Notion assignee "${mappedName}"`);
            } else {
                console.log(`⚠️ No mapping found for GitHub assignee "${login}"`);
            }
        });

        // Candidate statuses for PROD transition
        const candidateStatuses = ['In UAT', 'Failed in UAT', 'Passed UAT'];

        // Fetch candidate tickets
        const allTickets = await notion.findPagesByStatus(candidateStatuses);

        // ✅ Filter tickets where Notion assignee matches mapped name
        const matchingTickets = allTickets.filter(ticket => {
            const notionAssignees = (ticket.properties?.Assignee?.people || []).map(p => (p.name || '').toLowerCase());

            return prAssignees.some(prLogin => {
                const mappedName = loginToNotionName[prLogin];
                if (!mappedName) return false;
                return notionAssignees.includes(mappedName.toLowerCase());
            });
        });

        console.log(`📌 Found ${matchingTickets.length} candidate tickets linked to PR`);

        if (action === 'opened') {
            console.log(`🔗 Tickets linked: ${matchingTickets.map(t => t.id).join(', ')}`);
        }

        if (action === 'closed' && pull_request.merged) {
            console.log(`🚀 PR merged → transitioning tickets to Live in Prod`);
            await notion.updateMultiplePagesStatus(matchingTickets, 'Live in Prod');
        }
    } catch (err) {
        console.error('❌ Error in Notion Prod sync:', err);
        process.exit(1);
    }
}

main();
