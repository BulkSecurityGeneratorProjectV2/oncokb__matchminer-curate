import { Component, OnInit, Input } from '@angular/core';
import { TrialService } from '../service/trial.service';
import { AngularFireDatabase, AngularFireObject, AngularFireList } from 'angularfire2/database';
import * as _ from 'underscore';
import { Genomic } from '../genomic/genomic.model';
import { Clinical } from '../clinical/clinical.model';
import { MovingPath } from './movingPath.model';
import { Arm } from '../arm/arm.model';
@Component({
    selector: 'jhi-panel',
    templateUrl: './panel.component.html',
    styleUrls: ['panel.scss']
})
export class PanelComponent implements OnInit {
    @Input() path = '';
    // used to manage the icons to be displayed
    @Input() type = '';
    @Input() unit = {};
    @Input() arm = false;
    finalPath = [];
    message = '';
    addNode = false;
    moving = false;
    nodeOptions: Array<string> = ['Genomic', 'Clinical', 'And', 'Or'];
    nodeType = '';
    selectedItems = [];
    operationPool: {};
    movingPath: MovingPath;
    dataBlockToMove = {};
    currentPath = '';
    dropdownList = [
        { id: 1, itemName: 'Genomic' },
        { id: 2, itemName: 'Clinical' },
        { id: 3, itemName: 'And' },
        { id: 4, itemName: 'Or' }];
    armInput: Arm;
    originalMatch = [];
    originalArms = [];
    dataToModify = [];
    allSubTypesOptions = this.trialService.getAllSubTypesOptions();
    subToMainMapping = this.trialService.getSubToMainMapping();
    mainTypesOptions = this.trialService.getMainTypesOptions(); 
    isPermitted = true; 
    nctIdChosen:string;
    trialChosen: {};
    genomicInput: Genomic;
    clinicalInput: Clinical;
    constructor(private trialService: TrialService) { 
    }

    ngOnInit() {
        this.trialService.nctIdChosenObs.subscribe(message => this.nctIdChosen = message);
        this.trialService.trialChosenObs.subscribe(message => {
            this.trialChosen = message;
            this.originalMatch = this.trialChosen['treatment_list'].step[0].match;
            this.originalArms = this.trialChosen['treatment_list'].step[0].arm;
        });
        this.trialService.genomicInputObs.subscribe(message => {
            this.genomicInput = message;
        });
        this.trialService.clinicalInputObs.subscribe(message => {
            this.clinicalInput = message;
        });
        this.trialService.operationPoolObs.subscribe(message => {
            this.operationPool = message;
        });
        this.trialService.currentPathObs.subscribe(message => {
            this.currentPath = message;
        });
        this.trialService.movingPathObs.subscribe(message => {
            this.movingPath = message;
        });
        this.trialService.armInputObs.subscribe(message => {
            this.armInput = message;
        });
    }
    preparePath(pathParameter?: string) {
        const pathStr = pathParameter ? pathParameter : this.path;
        const pathArr = _.without(pathStr.split(','), '');
        let locationToChange: any = [];
        if (pathArr[0] === 'match') {
            locationToChange = this.originalMatch;
            this.dataToModify = this.originalMatch;
            pathArr.shift();
        } else if (pathArr[0] === 'arm') {
            locationToChange = this.originalArms[pathArr[1]].match;
            this.dataToModify = this.originalArms[pathArr[1]].match;
            pathArr.shift();
            pathArr.shift();
        }
        this.message = '';
        this.finalPath = [];
        for (let i = 0; i < pathArr.length; i++) {
            const point = pathArr[i].trim();
            this.finalPath.push(point);
            if (point.length > 0 && locationToChange[point]) {
                locationToChange = locationToChange[point];
                if (locationToChange.and) {
                    locationToChange = locationToChange.and;
                    this.finalPath.push('and');
                } else if (locationToChange.or) {
                    locationToChange = locationToChange.or;
                    this.finalPath.push('or');
                } else {
                    // case: the first time add nodes to match under each arm
                    //this.dataToModify = this.dataToModify[point].match;
                }
            }
        }
    }
    modifyNode(type: string) {
        let result = true;
        // validate the need to proceed
        if (type === 'delete') {
            result = confirm('This will delete the entire section. Are you sure you want to proceed?');
        }
        if (result) {
            if (this.arm === true) {
                this.modifyArmGroup(type);
            } else {
                this.preparePath();
                this.modifyData(this.dataToModify, this.finalPath, type);  
            }
            this.saveBacktoDB();
        }
    }
    saveBacktoDB() {
        this.trialService.getTrialRef(this.nctIdChosen).set({
            arm: this.originalArms,
            match: this.originalMatch
        }).then(result => {
            this.clearInput();
        }).catch(error => {
            console.log('Failed to save to DB ', error);
        });
    }
    modifyData(obj: Array<any>, path: Array<string>, type: string) {
        switch (type) {
            case 'delete':
            case 'remove':
                // different condition check between and/or node and genomic/clinical node
                if (path.length === 2 && (path[1] === 'and' || path[1] === 'or') || path.length === 1) {
                    if (type === 'remove') {
                        this.dataBlockToMove = _.clone(obj[path[0]]);
                        obj[path[0]].toBeRemoved = true;
                    } else {
                        obj.splice(Number(path[0]), 1);
                    }
                } else {
                    const index = path.shift();
                    this.modifyData(obj[index], path, type);
                }
                break;
            case 'update':
                if (path.length === 1) {
                    if (obj[path[0]].hasOwnProperty('genomic')) {
                        this.updateNode(obj[path[0]], 'genomic');
                    } else if (obj[path[0]].hasOwnProperty('clinical')) {
                        this.updateNode(obj[path[0]], 'clinical');
                    }
                } else {
                    const index = path.shift();
                    this.modifyData(obj[index], path, type);
                }
                break;
            case 'add':
                if (path.length === 0) {
                    this.addNewNode(obj);
                } else if (path.length === 1) {
                    if (obj.hasOwnProperty('and')) {
                        this.addNewNode(obj['and']);
                    } else if (obj.hasOwnProperty('or')) {
                        this.addNewNode(obj['or']);
                    }
                } else {
                    const index = path.shift();
                    this.modifyData(obj[index], path, type);
                }
                break;
            case 'exchange':
                if (path.length === 2) {
                    this.exchangeLogic(obj[path[0]]);
                } else {
                    const index = path.shift();
                    this.modifyData(obj[index], path, type);
                }
                break;    
            default:
                break;
        }
    }
    clearInput() {
        this.selectedItems = [];
        this.addNode = false;
        this.nodeType = '';
        this.clearNodeInput();
    }
    clearInputForm(keys: Array<string>, type: string) {
        if (type === 'Genomic') {
            for (let key of keys) {
                this.genomicInput[key] = '';
                this.genomicInput['no_'+key] = false;
            }    
        } else if (type === 'Clinical') {
            for (let key of keys) {
                this.clinicalInput[key] = '';
                this.clinicalInput['no_'+key] = false;
            }    
        } else if (type === 'arm') {
            for (let key of keys) {
                this.armInput[key] = '';
            } 
        }
    }
    clearNodeInput() {
        if (this.nodeType === 'Genomic') {
            this.clearInputForm(['hugo_symbol', 'oncokb_variant', 'matching_examples', 'protein_change', 'wildcard_protein_change', 'variant_classification', 'variant_category', 'exon', 'cnv_call'], this.nodeType);
            this.genomicInput.wildtype = '';
        } else if (this.nodeType === 'Clinical') {
            this.clearInputForm(['age_numerical', 'oncotree_diagnosis'], this.nodeType);
            this.clinicalInput['main_type'] = '';
            this.clinicalInput['sub_type'] = '';
        }
    }
    getGenomicValue(key: string) {
        if (this.genomicInput['no_' + key] === true) {
            return '!' + this.genomicInput[key];
        } else {
            return this.genomicInput[key];
        }
    }
    getClinicalValue(key: string) {
        if (this.clinicalInput['no_' + key] === true) {
            return '!' + (key === 'oncotree_diagnosis' ? this.getOncotree() : this.clinicalInput[key]);
        } else {
            return (key === 'oncotree_diagnosis' ? this.getOncotree() : this.clinicalInput[key]);
        }
    }
    getOncotree() {
        let oncotree_diagnosis = '';
        if (this.clinicalInput.sub_type) {
            oncotree_diagnosis = this.clinicalInput.sub_type;
        }else if (this.clinicalInput.main_type) {
            oncotree_diagnosis = this.clinicalInput.main_type;
        }
        return oncotree_diagnosis;
    }
    addNewNode(obj: Array<any>) {
        if (_.isEmpty(this.dataBlockToMove)) {
            switch (this.nodeType) {
                case 'Genomic':
                    obj.push({
                        genomic: {
                            hugo_symbol: this.getGenomicValue('hugo_symbol'),
                            oncokb_variant: this.getGenomicValue('oncokb_variant'),
                            matching_examples: this.getGenomicValue('matching_examples'),
                            protein_change: this.getGenomicValue('protein_change'),
                            wildcard_protein_change: this.getGenomicValue('wildcard_protein_change'),
                            variant_classification: this.getGenomicValue('variant_classification'),
                            variant_category: this.getGenomicValue('variant_category'),
                            exon: this.getGenomicValue('exon'),
                            cnv_call: this.getGenomicValue('cnv_call'),
                            wildtype: this.getGenomicValue('wildtype')
                        }
                    });
                    break;
                case 'Clinical':
                    obj.push({
                        clinical: {
                            age_numerical: this.getClinicalValue('age_numerical'),
                            oncotree_diagnosis: this.getClinicalValue('oncotree_diagnosis')
                        }
                    });
                    break;
                case 'And':
                case 'Or':
                    let tempObj1: any = [];
                    for (let item of this.selectedItems) {
                        switch (item.itemName) {
                            case 'Genomic':
                                tempObj1.push({
                                    genomic: {
                                        hugo_symbol: this.getGenomicValue('hugo_symbol'),
                                        oncokb_variant: this.getGenomicValue('oncokb_variant'),
                                        matching_examples: this.getGenomicValue('matching_examples'),
                                        protein_change: this.getGenomicValue('protein_change'),
                                        wildcard_protein_change: this.getGenomicValue('wildcard_protein_change'),
                                        variant_classification: this.getGenomicValue('variant_classification'),
                                        variant_category: this.getGenomicValue('variant_category'),
                                        exon: this.getGenomicValue('exon'),
                                        cnv_call: this.getGenomicValue('cnv_call'),
                                        wildtype: this.getGenomicValue('wildtype')
                                    }
                                });
                                break;
                            case 'Clinical':
                                tempObj1.push({
                                    clinical: {
                                        age_numerical: this.getClinicalValue('age_numerical'),
                                        oncotree_diagnosis: this.getClinicalValue('oncotree_diagnosis')
                                    }
                                });
                                break;
                            case 'And':
                                tempObj1.push({
                                    and: []
                                });
                                break;
                            case 'Or':
                                tempObj1.push({
                                    or: []
                                });
                                break;
                        }
                    }
                    let tempObj2: any = {};
                    if (this.nodeType === 'And') {
                        tempObj2.and = tempObj1;
                    } else if (this.nodeType === 'Or') {
                        tempObj2.or = tempObj1;
                    }
                    obj.push(tempObj2);
                    break;

            }
        } else {
            obj.push(this.dataBlockToMove);
        }
        obj.sort(this.sortModifiedArray);
    }
    updateNode(obj: any, type: string) {
        if (type === 'genomic') {
            obj['genomic'] = {
                hugo_symbol: this.getGenomicValue('hugo_symbol'),
                oncokb_variant: this.getGenomicValue('oncokb_variant'),
                matching_examples: this.getGenomicValue('matching_examples'),
                protein_change: this.getGenomicValue('protein_change'),
                wildcard_protein_change: this.getGenomicValue('wildcard_protein_change'),
                variant_classification: this.getGenomicValue('variant_classification'),
                variant_category: this.getGenomicValue('variant_category'),
                exon: this.getGenomicValue('exon'),
                cnv_call: this.getGenomicValue('cnv_call'),
                wildtype: this.genomicInput.wildtype
            };
        } else if (type === 'clinical') {
            obj['clinical'] = {
                age_numerical: this.getClinicalValue('age_numerical'),
                oncotree_diagnosis: this.getClinicalValue('oncotree_diagnosis')
            }
        }
    }
    exchangeLogic(obj: any) {
        if (obj.hasOwnProperty('or')) {
            obj['and'] = obj['or'];
            delete obj['or'];
        } else if (obj.hasOwnProperty('and')) {
            obj['or'] = obj['and'];
            delete obj['and'];
        }
    }
    sortModifiedArray(a: object, b: object) {
        const keys = ['genomic', 'clinical', 'and', 'or'];
        return keys.indexOf(Object.keys(a)[0]) - keys.indexOf(Object.keys(b)[0]);
    }
    setEditOriginalValues(keys: Array<any>, type: string) {
        if (type === 'genomic') {
            for (let key of keys) {
                if (this.unit['genomic'][key][0] === '!') {
                    this.genomicInput[key] = this.unit['genomic'][key].slice(1);
                    this.genomicInput['no_'+key] = true;
                } else {
                    this.genomicInput[key] = this.unit['genomic'][key];
                    this.genomicInput['no_'+key] = false;
                }
            }
        } else if (type === 'clinical') {
            for (let key of keys) {
                if (this.unit['clinical'][key][0] === '!') {
                    this.clinicalInput[key] = this.unit['clinical'][key].slice(1);
                    this.clinicalInput['no_'+key] = true;
                } else {
                    this.clinicalInput[key] = this.unit['clinical'][key];
                    this.clinicalInput['no_'+key] = false;
                }
            }
        } else if (type === 'arm') {
            for (const key of keys) {
                this.armInput[key] = this.unit[key];
            }
        }
    }
    editNode() { 
        this.operationPool['currentPath'] = this.path;
        this.operationPool['editing'] = true;
        if (this.unit.hasOwnProperty('genomic')) {
            this.setEditOriginalValues(['hugo_symbol', 'oncokb_variant', 'matching_examples', 'protein_change', 'wildcard_protein_change', 'variant_classification', 'variant_category', 'exon', 'cnv_call', 'wildtype'], 'genomic');
        } else if (this.unit.hasOwnProperty('clinical')) {
            this.setEditOriginalValues(['age_numerical'], 'clinical');
            this.setOncotree(this.unit['clinical']['oncotree_diagnosis']);
        } else if (this.unit.hasOwnProperty('arm_name')) {
            this.setEditOriginalValues(['arm_name', 'arm_description'], 'arm');
        }
    }
    setOncotree(oncotree_diagnosis: string) {
        this.clinicalInput['sub_type'] = '';
        this.clinicalInput['main_type'] = '';
        let isSubtype = false;
        for (let item of this.allSubTypesOptions) {
            if (item.value === oncotree_diagnosis) {
                this.clinicalInput['sub_type'] = oncotree_diagnosis;
                this.clinicalInput['main_type'] = this.subToMainMapping[oncotree_diagnosis];
                isSubtype = true;
            }
        }
        if (isSubtype === false) {
            for (let item of this.mainTypesOptions) {
                if (item.value === oncotree_diagnosis) {
                    this.clinicalInput['main_type'] = oncotree_diagnosis;
                }
            }
        }
    }
    preAddNode() {
        this.addNode = true;
        if (this.arm === true) {
            this.clearInputForm(['arm_name', 'arm_description'], 'arm');
        }
    }
    moveNode() {
        if (this.operationPool['relocate'] === true) {
            this.operationPool['currentPath'] = '';
            this.operationPool['relocate'] = false;
        } else {
            this.operationPool['currentPath'] = this.path;
            this.operationPool['relocate'] = true;
            this.movingPath.from = this.path;
        }
    }
    cancelModification() {
        this.operationPool['currentPath'] = '';
        this.operationPool['editing'] = false;
    }
    saveModification() {
        this.operationPool['currentPath'] = '';
        this.operationPool['editing'] = false;
        this.modifyNode('update');
    }
    dropDownNode() {
        this.operationPool['relocate'] = false;
        this.operationPool['currentPath'] = '';
        this.movingPath.to = this.path;
        // find the data to be moved and mark it as to be removed.
        // We can't remove it at this step because it will upset the path for the destination node
        this.preparePath(this.movingPath.from);
        this.modifyData(this.dataToModify, this.finalPath, 'remove');
        //add the data to destination node
        this.preparePath(this.movingPath.to);
        this.modifyData(this.dataToModify, this.finalPath, 'add');
        //remove the original data that has been moved to the destination
        this.removeOriginalNode(this.originalMatch);
        for (let arm of this.originalArms) {
            this.removeOriginalNode(arm.match);
        }
        this.dataBlockToMove = {};
        this.saveBacktoDB();
    }
    removeOriginalNode(match: Array<any>) {
        let itemsToRemove = [];
        for (let item of match) {
            if (item.toBeRemoved === true) {
                itemsToRemove.push(item);
            }
        }
        for (let item of itemsToRemove) {
            match.splice(match.indexOf(item), 1);
        }
        for (let item of match) {
            if (_.keys(item).indexOf('and') !== -1) {
                this.removeOriginalNode(item['and']);
            } else if (_.keys(item).indexOf('or') !== -1) {
                this.removeOriginalNode(item['or']);
            }
        }
    }
    // when user try to move a section, we hide all icons except the relocate icon to avoid distraction
    displayDestination() {
        if (this.isPermitted === false) return false;
        return this.type.indexOf('destination') !== -1 && this.operationPool['currentPath'] !== this.path && this.operationPool['relocate'] === true;
    }
    displayPencil() {
        if (this.isPermitted === false) return false;
        return this.type.indexOf('edit') !== -1 && this.operationPool['relocate'] !== true && this.operationPool['currentPath'] !== this.path;
    }
    displayAdd() {
        if (this.isPermitted === false) return false;
        return this.type.indexOf('add') !== -1 && this.operationPool['relocate'] !== true;
    }
    // There are three cases we display the trash icon
    // 1) when the page is first loaded
    // 2) when the item is not the current editing one
    displayTrash() {
        if (this.isPermitted === false) return false;
        return this.type.indexOf('delete') !== -1 && (this.operationPool['relocate'] !== true && this.operationPool['editing'] !== true
        || this.operationPool['editing'] === true && this.operationPool['currentPath'] !== this.path);
    }
    // There are three cases we display the move icon
    // 1) when the page is first loaded
    // 2) when the item is not the current editing one
    // 3) when the item is the one we chose to move around
    displayMove() {
        if (this.isPermitted === false) return false;
        return this.type.indexOf('relocate') !== -1 && (this.operationPool['relocate'] !== true && this.operationPool['editing'] !== true
        || this.operationPool['editing'] === true && this.operationPool['currentPath'] !== this.path
        || this.operationPool['relocate'] === true && this.operationPool['currentPath'] === this.path);
    }
    displayExchange() {
        if (this.isPermitted === false) return false;
        return this.type.indexOf('exchange') !== -1 && this.operationPool['relocate'] !== true;
    }
    modifyArmGroup(type) {
        if (type === 'add') {
            this.originalArms.push({
                arm_name: this.armInput.arm_name,
                arm_description: this.armInput.arm_description,
                match: []
            });
        } else if (type === 'delete') {
            const tempIndex = Number(this.path.split(',')[1].trim());
            this.originalArms.splice(tempIndex, 1);
        } else if (type === 'update') {
            const tempIndex = this.path.split(',')[1].trim();
            this.originalArms[tempIndex].arm_name = this.armInput['arm_name'];
            this.originalArms[tempIndex].arm_description = this.armInput['arm_description'];
        }
    }
}
