import { Component, OnInit, Input } from '@angular/core';
import { TrialService } from '../service/trial.service';
import { Arm } from '../arm/arm.model';
import { Drug } from '../drug/drug.model';
import { MainutilService } from '../service/mainutil.service';
import * as _ from 'lodash';

@Component({
    selector: 'jhi-arm',
    templateUrl: './arm.component.html',
    styleUrls: ['arm.scss']
})
export class ArmComponent implements OnInit {
    @Input() type = '';
    @Input() unit = {};
    @Input() path = '';
    operationPool: {};
    armInput: Arm;
    oncokb: boolean;

    constructor(private trialService: TrialService, public mainutilService: MainutilService) {
        this.oncokb = this.trialService.oncokb;
    }

    ngOnInit() {
        this.trialService.operationPoolObs.subscribe((message) => {
            this.operationPool = message;
        });
        this.trialService.armInputObs.subscribe((message) => {
            this.armInput = message;
        });
    }
    unCheckRadio(key, event) {
        this.armInput[key] = this.mainutilService.unCheckRadio(this.armInput[key], event.target.value);
    }
    displayDrugName(drugGroup: Array<Drug>) {
        return drugGroup.map((drug) => drug.name).join(' + ');
    }
    addDrugGroup() {
        this.armInput.drugs.push([]);
    }
    removeDrugGroup(index: number) {
        this.armInput.drugs.splice(index, 1);
    }
}
