import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs/BehaviorSubject';
import { AngularFireDatabase, AngularFireObject, AngularFireList } from 'angularfire2/database';
import { Observable } from 'rxjs/Observable';
import { Trial } from '../trial/trial.model';
import { Genomic } from '../genomic/genomic.model';
import { Clinical } from '../clinical/clinical.model';
import { MovingPath } from '../panel/movingPath.model';
import { Arm } from '../arm/arm.model';
import { Http, Response } from '@angular/http';
import * as _ from 'underscore';
import { currentId } from 'async_hooks';
import { SERVER_API_URL } from '../app.constants';
import { environment } from '../environments/environment';
@Injectable()
export class TrialService {
    private nctIdChosenSource = new BehaviorSubject<string>('');
    nctIdChosenObs = this.nctIdChosenSource.asObservable();

    private trialChosenSource = new BehaviorSubject<object>({});
    trialChosenObs = this.trialChosenSource.asObservable();

    private trialListSource = new BehaviorSubject<Array<string>>([]);
    trialListObs = this.trialListSource.asObservable();

    private authorizedSource = new BehaviorSubject<boolean>(false);
    authorizedObs = this.authorizedSource.asObservable();

    private operationPoolSource = new BehaviorSubject<object>({});
    operationPoolObs = this.operationPoolSource.asObservable();

    private currentPathSource = new BehaviorSubject<string>('');
    currentPathObs = this.currentPathSource.asObservable();

    movingPath: MovingPath = {
        from: '',
        to: ''
    }
    private movingPathSource = new BehaviorSubject<MovingPath>(this.movingPath);
    movingPathObs = this.movingPathSource.asObservable();

    genomicInput: Genomic = {
        hugo_symbol: ''
    };
    private genomicInputSource = new BehaviorSubject<Genomic>(this.genomicInput);
    genomicInputObs = this.genomicInputSource.asObservable();

    clinicalInput: Clinical= {};
    private clinicalInputSource = new BehaviorSubject<Clinical>(this.clinicalInput);
    clinicalInputObs = this.clinicalInputSource.asObservable();

    armInput: Arm = {
        arm_name: '',
        arm_description: ''
    };
    private armInputSource = new BehaviorSubject<Arm>(this.armInput);
    armInputObs = this.armInputSource.asObservable();

    subTypesOptions = {};
    allSubTypesOptions = [];
    subToMainMapping = {};
    mainTypesOptions = [{value: 'All Solid Tumors', label: 'All Solid Tumors'},
    {value: 'All Liquid Tumors', label: 'All Liquid Tumors'},
    {value: 'All Tumors', label: 'All Tumors'},
    {value: 'All Pediatric Tumors', label: 'All Pediatric Tumors'}];
    oncokb_variants = {};
    trialList = [];
    trialsRef: AngularFireObject<any>;
    production = environment.production ? environment.production : false;
    constructor(public http: Http, public db: AngularFireDatabase) {
        this.trialsRef = db.object('Trials');
        
        // prepare main types list
        this.http.get(this.getAPIUrl('MainType'))
        .subscribe((res: Response) => {
            let mainTypeQueries = [];
            for (const item of res.json().data) {
                mainTypeQueries.push({
                    "exactMatch": true,
                    "query": item.name,
                    "type": "mainType"
                });
                this.mainTypesOptions.push({
                    value: item.name,
                    label: item.name
                });
            }
            // prepare subtypes by maintype
            let queries =  {
                "queries": mainTypeQueries
              };
            this.http.post(this.getAPIUrl('SubType'), queries)
            .subscribe((res: Response) => {
                let tempSubTypes = res.json().data;
                let currentSubtype = '';
                let currentMaintype = '';
                for (const items of tempSubTypes) {
                    for (const item of items) {
                        currentMaintype = item.mainType.name;
                        currentSubtype = item.name;
                        this.allSubTypesOptions.push({
                            value: currentSubtype,
                            label: currentSubtype
                        });
                        this.subToMainMapping[currentSubtype] = currentMaintype;
                        if (this.subTypesOptions[currentMaintype] == undefined) {
                            this.subTypesOptions[currentMaintype] = [{
                                value: currentSubtype,
                                label: currentSubtype
                            }];
                        } else {
                            this.subTypesOptions[currentMaintype].push({
                                value: currentSubtype,
                                label: currentSubtype
                            });
                        }
                    }
                    this.subTypesOptions[currentMaintype].sort(function(a, b) {
                        return a.value > b.value;
                    });
                    this.subTypesOptions[''] = this.allSubTypesOptions;
                }
            });
        });
        // prepare oncokb variant list
        this.http.get(this.getAPIUrl('OncoKBVariant'))
        .subscribe((res: Response) => {
           const allAnnotatedVariants = res.json();
           for(const item of  allAnnotatedVariants) {
                if (item['gene']['hugoSymbol']) {
                    if (this.oncokb_variants[item['gene']['hugoSymbol']]) {
                        this.oncokb_variants[item['gene']['hugoSymbol']].push(item['alteration']);
                    } else {
                        this.oncokb_variants[item['gene']['hugoSymbol']] = [item['alteration']];
                    }
                }
           }
           for(const key of _.keys(this.oncokb_variants)) {
                this.oncokb_variants[key].sort();
           }
        });
    }
    fetchTrials() {
        this.trialsRef.snapshotChanges().subscribe(action => {
            this.authorizedSource.next(true);
            this.trialList = [];
            for (const nctId of _.keys(action.payload.val())) {
                this.trialList.push(action.payload.val()[nctId]);
            }
            this.trialListSource.next(this.trialList);
        }, error => {
            this.authorizedSource.next(false);
        });
    }
    setTrialChosen(nctId: string) {
        this.nctIdChosenSource.next(nctId);
        for (const trial of this.trialList) {
            if (nctId === trial.nct_id) {
                if (_.isUndefined(trial['treatment_list'])) {
                    trial['treatment_list'] = {
                        step: [{
                            arm:  [],
                            match: []
                        }]
                    }
                } else {
                    _.each(trial['treatment_list'].step[0].arm, function(armItem) {
                        if (_.isUndefined(armItem.match)) {
                            armItem.match = [];
                        }
                    });
                    if (_.isUndefined(trial['treatment_list'].step[0].match)) {
                        trial['treatment_list'].step[0].match = [];
                    }
                }
                this.trialChosenSource.next(trial);
                break;
            }
        }
    }
    getStyle(indent: number) {
        return { 'margin-left': (indent * 40) + 'px' };
    }
    getSubTypesOptions() {
        return this.subTypesOptions;
    }
    getSubToMainMapping() {
        return this.subToMainMapping;
    }
    getMainTypesOptions() {
        return this.mainTypesOptions;
    }
    getAllSubTypesOptions() {
        return this.allSubTypesOptions;
    }
    getOncokbVariants() {
        return this.oncokb_variants;
    }
    getTrialRef(nctId: string) {
        return this.db.object('Trials/' + nctId + '/treatment_list/step/0');
    }
    getAPIUrl(type: string) {
        if (this.production === true) {
            switch(type) {
                case 'MainType':
                    return SERVER_API_URL + 'proxy/http/oncotree.mskcc.org/oncotree/api/mainTypes';
                case 'SubType': 
                    return SERVER_API_URL + 'proxy/http/oncotree.mskcc.org/oncotree/api/tumorTypes/search';  
                case 'OncoKBVariant':
                    return SERVER_API_URL + 'proxy/http/oncokb.org/api/v1/variants';
                case 'GeneValidation':
                    return SERVER_API_URL + 'proxy/http/mygene.info/v3/query?species=human&q=symbol:';
                case 'ClinicalTrials':
                    return SERVER_API_URL + 'proxy/https/clinicaltrialsapi.cancer.gov/v1/clinical-trial/';
                case 'ExampleValidation':
                    return SERVER_API_URL + 'proxy/http/oncokb.org/api/v1/utils/match/variant?';
            }
        } else {
            switch(type) {
                case 'MainType':
                    return 'http://oncotree.mskcc.org/oncotree/api/mainTypes';
                case 'SubType': 
                    return 'http://oncotree.mskcc.org/oncotree/api/tumorTypes/search';  
                case 'OncoKBVariant':
                    return 'http://oncokb.org/api/v1/variants';
                case 'GeneValidation':
                    return 'http://mygene.info/v3/query?species=human&q=symbol:';
                case 'ClinicalTrials':
                    return 'https://clinicaltrialsapi.cancer.gov/v1/clinical-trial/';
                case 'ExampleValidation':
                    return 'http://oncokb.org/api/v1/utils/match/variant?';    
            }
        }
    }
}
