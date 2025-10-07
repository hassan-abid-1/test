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
        const targetBranch = pull_request.base.ref.toLowerCase();

        // ✅ Allow both "prod" and "production" as target branches
        if (!['prod', 'production'].includes(targetBranch)) {
            console.log(`⏭️ Skipping PR not targeting prod/production (target=${targetBranch})`);
            return;
        }

        // ✅ Extract PR assignees (GitHub logins)
        const prAssignees = (pull_request.assignees || []).map(a => a.login || '').map(n => n.toLowerCase());
        console.log(`👥 PR assignees: ${prAssignees.join(', ') || 'None'}`);

        // ✅ GitHub → Notion name mapping
        const loginToNotionName = {
            'zahratariq-96': 'Zahra Tariq',
            'melcantwell27': 'melanie cantwell',
            'beachsideproperty': 'Lisa',
            'zaid-shabbir-ui': 'Zaid Shabbir',
            'hassan-abid-1': 'Hassan Abid' // 👈 Added mapping for Production
        };

        // Log mapping
        prAssignees.forEach(login => {
            const mappedName = loginToNotionName[login];
            if (mappedName) {
                console.log(`🔗 GitHub assignee "${login}" → Notion assignee "${mappedName}"`);
            } else {
                console.log(`⚠️ No mapping found for GitHub assignee "${login}"`);
            }
        });

        // ✅ Candidate statuses for Production
        const candidateStatuses = ['In UAT', 'Failed in UAT', 'Passed UAT'];

        // Fetch candidate tickets from Notion
        const allTickets = await notion.findPagesByStatus(candidateStatuses);

        // ✅ Filter tickets by matching Notion assignee
        const matchingTickets = allTickets.filter(ticket => {
            const notionAssignees = (ticket.properties?.Assignee?.people || [])
                .map(p => (p.name || '').toLowerCase());

            return prAssignees.some(prLogin => {
                const mappedName = loginToNotionName[prLogin];
                if (!mappedName) return false;
                return notionAssignees.includes(mappedName.toLowerCase());
            });
        });

        console.log(`📌 Found ${matchingTickets.length} candidate tickets linked to PR`);

        if (action === 'opened') {
            console.log(`🔗 Tickets linked: ${matchingTickets.map(t => t.id).join(', ') || 'None'}`);
        }

        // ✅ When PR is merged, move tickets to Live in Prod
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
