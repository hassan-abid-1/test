const { Client } = require('@notionhq/client');

class NotionClient {
    constructor(apiKey, databaseId) {
        this.notion = new Client({ auth: apiKey });
        this.databaseId = databaseId;
    }

    async findPageByTaskId(taskId) {
        try {
            console.log(`Searching for Notion page with Task ID: ${taskId}`);

            const response = await this.notion.databases.query({
                database_id: this.databaseId,
                filter: {
                    property: "Task ID",
                    rich_text: {
                        equals: taskId
                    }
                }
            });

            console.log(`Found ${response.results.length} pages for Task ID: ${taskId}`);
            return response.results[0];

        } catch (error) {
            console.error('Error finding page by Task ID:', error);
            return null;
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

    async updateMultiplePagesStatus(pages, status) {
        console.log(`Updating ${pages.length} pages to status: ${status}`);
        for (const page of pages) {
            await this.updatePageStatus(page.id, status);
        }
    }
}

module.exports = { NotionClient };