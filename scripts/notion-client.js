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

            // Check for Task ID property (unique_id type for numeric matching)
            if (database.properties['Task ID']) {
                taskIdProperty = database.properties['Task ID'];
                propertyName = 'Task ID';
                console.log(`🎯 Using Task ID property (type: ${taskIdProperty.type})`);
            }

            if (!taskIdProperty) {
                console.error('No Task ID property found in database');
                return null;
            }

            // Build filter for unique_id type (numeric only)
            if (taskIdProperty.type !== 'unique_id') {
                console.error(`Expected Task ID to be unique_id type, got: ${taskIdProperty.type}`);
                return null;
            }

            const numericId = typeof taskId === 'string' ? parseInt(taskId) : taskId;
            if (isNaN(numericId)) {
                console.log(`⚠️  Cannot search Task ID with non-numeric value: ${taskId}`);
                return null;
            }

            const filter = {
                property: propertyName,
                unique_id: {
                    equals: numericId
                }
            };

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

    async findPagesByStatusAndAssignee(statuses, assigneeEmail) {
        try {
            if (!assigneeEmail) {
                console.log('⚠️ No assignee email provided, falling back to status-only search');
                return await this.findPagesByStatus(statuses);
            }

            // Build status conditions
            const statusConditions = statuses.map(status => ({
                property: "Status",
                select: {
                    equals: status
                }
            }));

            // Get database schema to understand assignee property structure
            const database = await this.notion.databases.retrieve({
                database_id: this.databaseId
            });

            let assigneeProperty = null;
            let assigneePropertyName = null;

            // Look for common assignee property names
            const possibleAssigneeNames = ['Assignee', 'Assigned To', 'Owner', 'Developer', 'Person'];
            for (const name of possibleAssigneeNames) {
                if (database.properties[name]) {
                    assigneeProperty = database.properties[name];
                    assigneePropertyName = name;
                    console.log(`🎯 Using assignee property: ${name} (type: ${assigneeProperty.type})`);
                    break;
                }
            }

            if (!assigneeProperty) {
                console.log('⚠️ No assignee property found, falling back to status-only search');
                return await this.findPagesByStatus(statuses);
            }

            // Build assignee filter based on property type
            let assigneeFilter = null;

            if (assigneeProperty.type === 'people') {
                // For people property, we need to search by email
                assigneeFilter = {
                    property: assigneePropertyName,
                    people: {
                        contains: assigneeEmail
                    }
                };
            } else if (assigneeProperty.type === 'rich_text' || assigneeProperty.type === 'title') {
                // For text properties, search by email or name
                assigneeFilter = {
                    property: assigneePropertyName,
                    rich_text: {
                        contains: assigneeEmail
                    }
                };
            } else if (assigneeProperty.type === 'email') {
                // For email properties
                assigneeFilter = {
                    property: assigneePropertyName,
                    email: {
                        equals: assigneeEmail
                    }
                };
            } else {
                console.log(`⚠️ Unsupported assignee property type: ${assigneeProperty.type}, falling back to status-only search`);
                return await this.findPagesByStatus(statuses);
            }

            // Combine status and assignee filters
            const filter = {
                and: [
                    {
                        or: statusConditions
                    },
                    assigneeFilter
                ]
            };

            const response = await this.notion.databases.query({
                database_id: this.databaseId,
                filter: filter
            });

            console.log(`Found ${response.results.length} pages for assignee ${assigneeEmail} with statuses: ${statuses.join(', ')}`);
            return response.results;

        } catch (error) {
            console.error('Error finding pages by status and assignee:', error);
            console.log('Falling back to status-only search');
            return await this.findPagesByStatus(statuses);
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