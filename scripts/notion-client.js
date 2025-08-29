const { Client } = require('@notionhq/client');

class NotionClient {
    constructor(apiKey, databaseId) {
        this.notion = new Client({ auth: apiKey });
        this.databaseId = databaseId;
    }

    async findPageByTaskId(taskId) {
        try {
            console.log(`Searching for Notion page with Task ID: ${taskId}`);

            // First, let's try to get the database schema to understand the property types
            const database = await this.notion.databases.retrieve({
                database_id: this.databaseId
            });

            // Log available properties for debugging
            console.log('Available database properties:', Object.keys(database.properties));

            // Determine the correct property name and type
            let taskIdProperty = null;
            let propertyName = null;

            // Check for common task ID property names
            const possibleNames = ['Task ID', 'task_id', 'taskid', 'auto_increment_id', 'ID', 'id'];

            for (const name of possibleNames) {
                if (database.properties[name]) {
                    taskIdProperty = database.properties[name];
                    propertyName = name;
                    break;
                }
            }

            if (!taskIdProperty) {
                console.error('No Task ID property found. Available properties:', Object.keys(database.properties));
                return null;
            }

            console.log(`Using property: ${propertyName} of type: ${taskIdProperty.type}`);

            // Build the filter based on property type
            let filter;

            switch (taskIdProperty.type) {
                case 'number':
                    // If it's a number, convert taskId to number
                    const numericTaskId = typeof taskId === 'string' ? parseInt(taskId) : taskId;
                    if (isNaN(numericTaskId)) {
                        console.error(`Cannot convert task ID "${taskId}" to number for numeric property`);
                        return null;
                    }
                    filter = {
                        property: propertyName,
                        number: {
                            equals: numericTaskId
                        }
                    };
                    break;

                case 'rich_text':
                case 'title':
                    filter = {
                        property: propertyName,
                        rich_text: {
                            equals: taskId.toString()
                        }
                    };
                    break;

                case 'select':
                    filter = {
                        property: propertyName,
                        select: {
                            equals: taskId.toString()
                        }
                    };
                    break;

                case 'unique_id':
                    // For unique_id properties, we need to use a different approach
                    filter = {
                        property: propertyName,
                        unique_id: {
                            equals: parseInt(taskId) || taskId
                        }
                    };
                    break;

                default:
                    console.error(`Unsupported property type: ${taskIdProperty.type}`);
                    return null;
            }

            const response = await this.notion.databases.query({
                database_id: this.databaseId,
                filter: filter
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

    // Helper method to inspect database schema
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