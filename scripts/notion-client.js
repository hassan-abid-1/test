const { Client } = require('@notionhq/client');

class NotionClient {
    constructor(apiKey, databaseId) {
        this.notion = new Client({ auth: apiKey });
        this.databaseId = databaseId;
    }

    async findPageByBranchName(branchName) {
        try {
            console.log(`Searching for Notion page with branch: ${branchName}`);

            const response = await this.notion.databases.query({
                database_id: this.databaseId,
                filter: {
                    property: "Branch Name",
                    rich_text: {
                        equals: branchName
                    }
                }
            });

            console.log(`Found ${response.results.length} pages for branch: ${branchName}`);
            return response.results[0];

        } catch (error) {
            console.error('Error finding page by branch name:', error);
            return null;
        }
    }

    async findPageByTicketId(ticketId) {
        try {
            console.log(`Searching for Notion page with ticket ID: ${ticketId}`);

            const response = await this.notion.databases.query({
                database_id: this.databaseId,
                filter: {
                    property: "Ticket ID",
                    rich_text: {
                        equals: ticketId
                    }
                }
            });

            console.log(`Found ${response.results.length} pages for ticket: ${ticketId}`);
            return response.results[0];

        } catch (error) {
            console.error('Error finding page by ticket ID:', error);
            return null;
        }
    }

    async findPagesByStatus(statuses) {
        try {
            const orConditions = statuses.map(status => ({
                property: "Status",
                select: {
                    equals: status
                }
            }));

            const response = await this.notion.databases.query({
                database_id: this.databaseId,
                filter: {
                    or: orConditions
                }
            });

            console.log(`Found ${response.results.length} pages with statuses: ${statuses.join(', ')}`);
            return response.results;

        } catch (error) {
            console.error('Error finding pages by status:', error);
            return [];
        }
    }

    async updatePageStatus(pageId, status) {
        try {
            await this.notion.pages.update({
                page_id: pageId,
                properties: {
                    "Status": {
                        select: { name: status }
                    }
                }
            });
            console.log(`✅ Updated page ${pageId} to: ${status}`);
        } catch (error) {
            console.error('❌ Error updating page status:', error);
            throw error;
        }
    }

    async updateMultiplePagesStatus(pages, status) {
        console.log(`Updating ${pages.length} pages to status: ${status}`);
        for (const page of pages) {
            await this.updatePageStatus(page.id, status);
        }
    }
}

module.exports = { NotionClient };