import { Uri } from "vscode";

//========== SHARED ==============================
interface SNApplication {
    name:String;
    folderName:String;
    sys_id:String;
}

//========== SHARED ==============================


//========== START servicenow.json ===============

interface InstanceData {
    applications:Array<SNApplication>;
    connection:InstanceConnectionData;
    name:string;
    path:Uri;
    tableConfig:snDefaultTables;
}

interface InstanceConnectionData{
    url:String;
    auth:InstanceAuthData
}

/**
 * @type oauth or basic
 */
interface InstanceAuthData {
    type:string;
    username: string;
    password: string;
    OAuth: InstanceOAuthData;
}

interface InstanceOAuthData {
    client_id:string;
    client_secret:string;
    token: SNOAuthToken;
    lastRetrieved:number;
}

interface SNOAuthToken {
    scope:string;
    token_type:string;
    expires_in:number;
    refresh_token:string;
    access_token:string
}

//========== END servicenow.json ================

//========== START servicenow_sync_data.json ===============


interface InstanceAppSyncData {
    files:Array<SyncedFile>;
    application:SNApplication;
}

interface SyncedFile {
    path:Uri,
    table:string,
    sys_id:string,
    field:string,
    sys_scope:string,
    sys_package:string
}

//========== END servicenow_sync_data.json ===============


//========== START ServiceNow Table Config ================

interface snDefaultTables {
    tables:Array<snTableConfig>
}

interface snTableConfig {
    name:string;
    display_field:string;
    fields:Array<snTableField>;
    children:Array<snTableConfig>;
}

interface snTableField {
    name:string;
    label:string;
    extention:string;
}

//========== END ServiceNow Table Config ================