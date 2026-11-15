-- Object-local property definitions and values travel with their existing metadata.
-- Existing resource cleanup triggers therefore cover properties as well.
ALTER TABLE resource_metadata ADD COLUMN properties_json TEXT NOT NULL DEFAULT '[]'
 CHECK(json_valid(properties_json) AND json_type(properties_json)='array');
PRAGMA user_version=9;
