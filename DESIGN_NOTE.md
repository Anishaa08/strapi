## README: Automated Audit Logging System for Strapi

This document provides a concise architectural overview and implementation summary for the *Automated Audit Logging* feature within the Strapi V5 environment, designed to comprehensively capture and store all *Content API changes*.

***

##  Overview

The Automated Audit Logging System operates as a *core application feature*. It uses a single, centralized event subscription to monitor all content model modifications, ensuring comprehensive coverage without requiring model-specific configuration. Log data is persisted to an isolated content type and secured via Strapi's Role-Based Access Control (RBAC).

***

## I. Architectural Strategy

The system's design prioritizes automation and low maintenance.

### 1. Centralized Change Interception

Instead of manually defining lifecycle hooks for every content type, the system uses *Global DB Lifecycles* to subscribe to events for all models.

The feature is implemented in src/index.ts within the bootstrap function. It subscribes to the afterCreate, afterUpdate, and afterDelete events using the wildcard model selector: models: ['*']. This guarantees that the logging logic is triggered automatically for any Content API operation across the entire application.

### 2. Data Flow & User Identification

The logging process executes at the service layer upon a database change:

1.  A Content API request modifies a record (e.g., an Article).
2.  The global lifecycle hook is triggered.
3.  The system reliably identifies the authenticated user via strapi.requestContext.get().state.user.
4.  The action detailing the content_type, record_id, and action is logged.
5.  The log entry is persisted to the isolated **api::audit-log.audit-log** collection.

***

## II. 🛠 Detailed Implementation

### A. Data Modeling & Persistence

Log data is stored in a dedicated content type, defined in src/api/audit-logs/content-types/audit-log/schema.json, to ensure separation from application content. Each log entry contains key metadata: the *API slug of the modified model* (content_type), the *unique identifier of the record* (record_id), the *operation type* (action—CREATE, UPDATE, or DELETE), the *execution time* (timestamp), the *user ID* (user_id), and the *change details* (changes—a JSON field).

### B. Efficient Indexing Strategy

To maintain query performance on the high-volume log table, *programmatic indexing* is necessary since Strapi's Content-Type builder lacks custom index support.

An optional script, **./bootstrap/indexes.ts**, is dynamically loaded and executed during application startup (src/index.ts). This script uses Strapi’s internal database methods to create necessary indexes, such as a *composite index on* (content_type, action, timestamp), ensuring efficient filtering as the table scales.

### C. Advanced Update Interception (Diff Calculation)

The afterUpdate hook uses an advanced mechanism to capture only the modified fields:

1.  *Pre-fetch:* The hook logic first calls tryFetchBefore to retrieve the original, pre-update state of the record from the database.
2.  *Diffing:* A utility function (computeDiff) performs a deep comparison between the "old" (pre-fetched) data and the "new" data (result).
3.  *Storage:* Only the resulting *difference object* is stored in the changes JSON field, optimizing storage and providing clear forensic detail.

### D. Access Control and Configuration

#### Access Control (RBAC)

Access to log retrieval is strictly limited to authorized administrators.

The src/index.ts bootstrap function programmatically registers a new admin permission: **api::audit-log.read**. The REST route (src/api/audit-logs/routes/audit-log.js) applies the **admin::hasPermissions** policy, enforcing that only administrative users with this granted permission can successfully query the endpoint.

#### Configuration Options

The system is configured via application configuration files (e.g., config/plugins.ts).

1.  **auditLog.enabled (boolean):** A *Global Kill Switch* checked in the bootstrap function. If false, the system skips registering global lifecycle hooks, completely disabling logging.
2.  **auditLog.excludeContentTypes (array):** An array of content type UIDs (e.g., plugin::upload.file) to be explicitly ignored, skipping the logging process for those specific operations.

***

## III.  REST API Reference

The secure endpoint for log retrieval is **/api/audit-logs**. It supports standard Strapi query parameters for filtering, sorting, and pagination.

### Filtering

The API leverages Strapi's advanced query syntax to filter across key metadata fields:

* *By Content Type:* ?filters[content_type][$eq]=api::post.post
* *By User ID:* ?filters[user_id][$eq]=5
* *By Action Type:* ?filters[action][$eq]=DELETE
* *By Date Range:* ?filters[timestamp][$gte]=2024-01-01T00:00:00Z&filters[timestamp][$lte]=2024-01-31T23:59:59Z

### Pagination and Sorting

* *Pagination:* Use pagination[limit] to set the maximum entries per request and pagination[start] to define the starting offset.
* *Sorting:* The default sort is **timestamp:desc** (newest first), but the sort parameter supports sorting by any field.