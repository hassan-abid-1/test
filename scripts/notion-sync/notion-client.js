const { Client } = require('@notionhq/client');

class NotionClient {
    constructor(apiKey, databaseId) {
        this.notion = new Client({ auth: apiKey });
        this.databaseId = databaseId;
    }

    async findPageByTaskId(taskId) {
        try {
            console.log(`Searching for Notion page with Task ID: ${taskId}`);
            const database = await this.notion.databases.retrieve({
                database_id: this.databaseId
            });

            if (!database.properties['Task ID']) {
                console.error('No Task ID property found in database');
                return null;
            }

            const taskIdProperty = database.properties['Task ID'];
            if (taskIdProperty.type !== 'unique_id') {
                console.error(`Expected Task ID to be unique_id type, got: ${taskIdProperty.type}`);
                return null;
            }

            const numericId = typeof taskId === 'string' ? parseInt(taskId) : taskId;
            if (isNaN(numericId)) {
                console.log(`⚠️ Cannot search Task ID with non-numeric value: ${taskId}`);
                return null;
            }

            const filter = {
                property: 'Task ID',
                unique_id: { equals: numericId }
            };

            const response = await this.notion.databases.query({
                database_id: this.databaseId,
                filter
            });

            console.log(`Found ${response.results.length} pages for Task ID: ${taskId}`);
            return response.results[0] || null;
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
                    "Status": { status: { name: status } }
                }
            });
            console.log(`✅ Updated page ${pageId} → ${status}`);
        } catch (error) {
            console.error('❌ Error updating page status:', error);
            throw error;
        }
    }

    async findPagesByStatus(statuses) {
        try {
            const orConditions = statuses.map(status => ({
                property: "Status",
                status: { equals: status }
            }));

            const response = await this.notion.databases.query({
                database_id: this.databaseId,
                filter: { or: orConditions }
            });

            console.log(`Found ${response.results.length} pages with statuses: ${statuses.join(', ')}`);
            return response.results;
        } catch (error) {
            console.error('Error finding pages by status:', error);
            return [];
        }
    }

    async findPagesByStatusAndAssignee(statuses, assigneeEmail) {
        try {
            if (!assigneeEmail) {
                console.log('⚠️ No assignee email provided, falling back to status-only search');
                return await this.findPagesByStatus(statuses);
            }

            // Get Notion userId from email
            const users = await this.notion.users.list();
            const matchedUser = users.results.find(
                u => u.type === 'person' && u.person?.email?.toLowerCase() === assigneeEmail.toLowerCase()
            );

            if (!matchedUser) {
                console.log(`⚠️ Could not find Notion user for email: ${assigneeEmail}, falling back to status-only search`);
                return await this.findPagesByStatus(statuses);
            }

            const userId = matchedUser.id;

            const filter = {
                and: [
                    {
                        or: statuses.map(status => ({
                            property: "Status",
                            status: { equals: status }
                        }))
                    },
                    {
                        property: "Assignee",
                        people: { contains: userId }
                    }
                ]
            };

            const response = await this.notion.databases.query({
                database_id: this.databaseId,
                filter
            });

            console.log(`Found ${response.results.length} pages for ${assigneeEmail} with statuses: ${statuses.join(', ')}`);
            return response.results;
        } catch (error) {
            console.error('Error finding pages by status and assignee:', error);
            return await this.findPagesByStatus(statuses);
        }
    }

    async updateMultiplePagesStatus(pages, status) {
        console.log(`Updating ${pages.length} pages → ${status}`);
        for (const page of pages) {
            await this.updatePageStatus(page.id, status);
        }
    }

    async inspectDatabaseSchema() {
        try {
            const database = await this.notion.databases.retrieve({
                database_id: this.databaseId
            });

            console.log('\n=== Database Schema ===');
            for (const [name, property] of Object.entries(database.properties)) {
                console.log(`Property: ${name} | Type: ${property.type}`);
            }
            console.log('========================\n');

            return database.properties;
        } catch (error) {
            console.error('Error inspecting database schema:', error);
            return null;
        }
    }
}

module.exports = { NotionClient };