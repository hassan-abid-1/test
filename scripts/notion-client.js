const { Client } = require('@notionhq/client');

class NotionClient {
    constructor(apiKey, databaseId) {
        this.notion = new Client({ auth: apiKey });
        this.databaseId = databaseId;
    }

    async findPageByPRNumber(prNumber) {
        try {
            const response = await this.notion.databases.query({
                database_id: this.databaseId,
                filter: {
                    property: "PR Number",
                    number: {
                        equals: parseInt(prNumber)
                    }
                }
            });
            return response.results[0];
        } catch (error) {
            console.error('Error finding Notion page:', error);
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
            console.log(`✓ Updated page ${pageId} to: ${status}`);
        } catch (error) {
            console.error('Error updating page:', error);
            throw error;
        }
    }

    async updateMultiplePagesStatus(pages, status) {
        for (const page of pages) {
            await this.updatePageStatus(page.id, status);
        }
    }
}

module.exports = { NotionClient };