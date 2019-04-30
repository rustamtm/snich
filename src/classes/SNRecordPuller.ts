import { snRecord, SNApplication, SNQPItem } from "../myTypes/globals";
import { SystemLogHelper } from "./LogHelper";
import { InstanceMaster, InstancesList } from "./InstanceConfigManager";
import { RESTClient } from "./RESTClient";
import * as vscode from 'vscode';
import { WorkspaceManager } from "./WorkspaceManager";
import { TableConfig } from "./SNDefaultTables";

export class SNFilePuller {
    
    instanceList: InstancesList;
    logger: SystemLogHelper;
    appScope?: SNApplication;
    lib: string = "SNFilePuller";
    
    constructor(instanceList: InstancesList, logger?: SystemLogHelper) {
        this.logger = logger || new SystemLogHelper();
        let func = 'constructor';
        this.logger.info(this.lib, func, 'START');
        this.instanceList = instanceList;
        this.logger.info(this.lib, func, 'END');
    }
    
    async syncRecord() {
        let func = 'syncRecord';
        this.logger.info(this.lib, func, 'START');
        
        let selectedInstance:InstanceMaster = await this.instanceList.selectInstance();
        if(!selectedInstance){
            vscode.window.showWarningMessage('Aborted Sync Record');
            return;
        }

        let configuredTables = selectedInstance.tableConfig;
        
        let client = new RESTClient(selectedInstance.getConfig(), this.logger);
        let encodedQuery = 'super_class.name=sys_metadata^nameIN' + configuredTables.tableNameList;
        
        let tableRecs:Array<snRecord> = await client.getRecords('sys_db_object', encodedQuery, ["name", "label"], true);
        
        if(!tableRecs || tableRecs.length === 0){
            vscode.window.showWarningMessage('Attempted to get configured tables from instance and failed. Aborting sync record. See logs for detail.');
            return;
        }
        
        let tableqpItems:Array<SNQPItem> = [];
        tableRecs.forEach((record: snRecord) => {
            tableqpItems.push({ "label": record.label, "detail": record.name + ' - ' + record.sys_scope, value: record });
        });
        
        this.logger.info(this.lib, func, "Built quick pick options based on table records returned.");
        
        let tableSelection = await vscode.window.showQuickPick(tableqpItems, <vscode.QuickPickOptions>{ "placeHolder": "Select table to retrieve record from. Table Not found? Make sure it's in the table_config. Or configure table using command pallete.", ignoreFocusOut: true, matchOnDetail: true, matchOnDescription: true });
        if(!tableSelection){
            vscode.window.showWarningMessage('Sync record aborted. No Table Selected.');
            return;
        }
        let tableRec = tableSelection.value;
        let tableConfig = <TableConfig>{};
        configuredTables.tables.forEach((table) =>{
            if (table.name === tableRec.name) {
                this.logger.info(this.lib, func, 'Found table config.', table);
                tableConfig = table;
            }
        });
        
        let fields = ["name"];
        fields.push(tableConfig.display_field);
        fields = fields.concat(tableConfig.additional_display_fields);
        
        let tableFileRecs = await client.getRecords(tableRec.name, "ORDERBYDESCsys_updated_on", fields, true);
        if(!tableFileRecs || tableFileRecs.length === 0){
            vscode.window.showWarningMessage('Did not find any records for table. Aborting sync record.');
            return undefined;
        }
        
        let fileqpitems:Array<SNQPItem> = [];
        tableFileRecs.forEach((record:any) => {
            let label = record[tableConfig.display_field];

            let recordName = record.sys_name || record.name || record.update_name;
            if(tableConfig.additional_display_fields && tableConfig.additional_display_fields.length > 0){
                recordName = tableConfig.getDisplayValue(record);
            }
            fileqpitems.push({ "label": label, "detail": recordName + ' - ' + record.sys_scope, value: record });
            
        });
        let settings = vscode.workspace.getConfiguration();
        let selectMultiple = settings.get('snich.syncRecordMultiple');

        let selectedFileRecs:any = await vscode.window.showQuickPick(fileqpitems, <vscode.QuickPickOptions>{ "placeHolder": "Select the records to retrieve.", ignoreFocusOut: true, matchOnDetail: true, matchOnDescription: true, canPickMany: selectMultiple });
        this.logger.info(this.lib, func, 'SELECTED FILES TO SYNC: ', selectedFileRecs);
        if(selectedFileRecs && !selectedFileRecs.length){
            //not an array which means we're in select one mode... lets make it array so the rest of our code can stay the same
            selectedFileRecs = [selectedFileRecs];
        }
        
        if(!selectedFileRecs || selectedFileRecs.length === 0){
            vscode.window.showWarningMessage('No record selected. Sync record aborted.');
            return undefined;        
        }
        if(selectedFileRecs && selectedFileRecs.length > 0 && !selectedFileRecs[0].sys_id){
            vscode.window.showErrorMessage('Unknown error occured, but the record that came back did not have a sys_id attribute. Please submit issue on github for this extension.');
            return undefined;
        }
        this.logger.info(this.lib, func, 'Selected file record:', selectedFileRecs);
        
        selectedFileRecs.forEach(async(selectedFile:any) => {
            let fileRec = selectedFile.value;
            this.logger.info(this.lib, func, 'selected file', fileRec);
            let fieldsList = [];
            fieldsList.push(tableConfig.display_field);
            tableConfig.fields.forEach((field) => {
                fieldsList.push(field.name);
            });
            tableConfig.additional_display_fields.forEach((dvField) =>{
                fieldsList.push(dvField);
            });
            
            let recordToSave = await client.getRecord(tableConfig.name, fileRec.sys_id, fieldsList);
            if(!recordToSave){
                vscode.window.showWarningMessage(`For some reason we couldn't grab the file to sync. Aborting sync record.`);
                return undefined;
            }
            
            let wsMgr = new WorkspaceManager(this.logger);
            let fileCreation = wsMgr.createSyncedFile(selectedInstance, tableConfig, recordToSave, true);
            wsMgr.writeSyncedFiles(selectedInstance);
            if(!fileCreation){
                vscode.window.showWarningMessage('Failed to create file during Sync Record. See logs for details.');
            }
        });
        
        
    }
    
    async pullAllAppFiles() {
        let func = 'pullAllAppFiles';
        let client: RESTClient;
        this.logger.info(this.lib, func, 'START');
        
        let wsManager = new WorkspaceManager();
        
        let selectedInstance:InstanceMaster = await this.instanceList.selectInstance();
        if(!selectedInstance){
            vscode.window.showWarningMessage('Load all app files aborted. Instances not selected.');
            return undefined;
        }

        //setup our rest client and grab the available application records.
        client = new RESTClient(selectedInstance.getConfig());
        let appRecords = await client.getRecords('sys_scope', 'scope!=global', ['name', 'scope', 'short_description']);
        
        if(!appRecords || appRecords.length === 0){
            vscode.window.showWarningMessage('Load all app files aborted. Did not find any applications for the selected instance.');
            return undefined;
        }
        
        //get config and see if we're showing SN Apps or not. 
        let vsConfig = vscode.workspace.getConfiguration();
        let showSNApps = vsConfig.get('snich.showSNApps');
        
        let appItems = <Array<SNQPItem>>[];
        appRecords.forEach((appRec: any) => {
            if (!showSNApps && appRec.scope.indexOf('sn_') === 0) {
                //don't add if we aren't showing sn app, and app returned was an sn_ app scope. 
            } else {
                appItems.push({ label: appRec.name + " (" + appRec.scope + ")", description: appRec.short_description, value: appRec });
            }
        });

        if (appItems.length === 0) {
            vscode.window.showWarningMessage('Selected instance: ' + selectedInstance.getConfig().name + ' did not have any applications that were not in the SN Scope. Adjust settings to allow SN apps or create a scopped application to start syncing records.');
            return undefined;
        }
        
        let appSelected = await vscode.window.showQuickPick(appItems, { placeHolder: "Select application to retrieve files from.", ignoreFocusOut: true, matchOnDetail: true, matchOnDescription: true });
        if(!appSelected){
            vscode.window.showWarningMessage('Load all app files aborted. No application selected.');
            return undefined;
        }

        let appScope = appSelected.value.scope;
        //await recordRecursor(selectedInstance, 0, appScope);

        let tables = selectedInstance.tableConfig.tables;
        
        tables.forEach(async (tableConfig) => {
            //build our fields to get from server for this table config.
            let fields = <Array<string>>[];
            fields.push(tableConfig.display_field);
            fields = fields.concat(tableConfig.additional_display_fields);
            tableConfig.fields.forEach((field) => {
                fields.push(field.name);
            });
            let encodedQuery = 'sys_scope.scope=' + appScope;
            let tableRecs = await client.getRecords(tableConfig.name, encodedQuery, fields);
            if(!tableRecs || tableRecs.length === 0){
                vscode.window.showInformationMessage(`Did not find any records for table: ${tableConfig.label} [${tableConfig.name}]`);
                return false;
            }

            if (tableRecs) {
                tableRecs.forEach(async (record) => {
                    await wsManager.createSyncedFile(selectedInstance, tableConfig, record, false);
                });
                vscode.window.showInformationMessage(`Created ${tableRecs.length} files for: ${tableConfig.label} [${tableConfig.name}]` );
                wsManager.writeSyncedFiles(selectedInstance);
            }
        });


        this.logger.info(this.lib, func, "About to write synced files!:", selectedInstance);
        vscode.window.showInformationMessage('All application files have been loaded. You may need to refresh your workspace explorer.');
        this.logger.info(this.lib, func, 'END');
        return true;
        
    }
}