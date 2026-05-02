import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';

import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzResultModule } from 'ng-zorro-antd/result';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSpaceModule } from 'ng-zorro-antd/space';
import { NzTagModule } from 'ng-zorro-antd/tag';

import { County, Party, Representative, VotingApiService, VoteRequest } from './voting-api.service';

const PID_PATTERN = /^\d{6}[A-Z]{2}$/;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    NzAlertModule,
    NzButtonModule,
    NzCardModule,
    NzDividerModule,
    NzFormModule,
    NzGridModule,
    NzIconModule,
    NzInputModule,
    NzResultModule,
    NzSelectModule,
    NzSpaceModule,
    NzTagModule
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly votingApi = inject(VotingApiService);

  counties: County[] = [];
  parties: Party[] = [];
  representatives: Representative[] = [];
  readonly sectors = [1, 2, 3] as const;

  readonly dataLoadError = signal<string | null>(null);
  readonly isLoadingData = signal(true);
  readonly submissionError = signal<string | null>(null);
  readonly submissionSuccess = signal<string | null>(null);
  readonly isSubmitting = signal(false);

  readonly form = this.fb.group({
    firstName: ['', [Validators.required, this.hungarianNameValidator]],
    lastName: ['', [Validators.required, this.hungarianNameValidator]],
    pid: ['', [Validators.required, Validators.pattern(PID_PATTERN)]],
    countyId: ['', [Validators.required]],
    sector: [1, [Validators.required]],
    partyId: ['', [Validators.required]],
    representativeId: ['', [Validators.required]]
  });

  ngOnInit(): void {
    this.loadReferenceData();
  }

  get availableRepresentatives(): Representative[] {
    const countyId = this.form.controls.countyId.value;
    const sector = this.form.controls.sector.value;
    const partyId = this.form.controls.partyId.value;

    return this.representatives.filter(representative =>
      representative.countyId === countyId &&
      representative.sector === sector &&
      (!partyId || representative.partyId === partyId)
    );
  }

  constructor() {
    this.form.controls.countyId.valueChanges.subscribe(() => this.resetRepresentative());
    this.form.controls.sector.valueChanges.subscribe(() => this.resetRepresentative());
    this.form.controls.partyId.valueChanges.subscribe(() => this.resetRepresentative());
  }

  get selectedCounty(): County | undefined {
    return this.counties.find(county => county.id === this.form.controls.countyId.value);
  }

  get selectedParty(): Party | undefined {
    return this.parties.find(party => party.id === this.form.controls.partyId.value);
  }

  get selectedRepresentative(): Representative | undefined {
    return this.representatives.find(representative => representative.id === this.form.controls.representativeId.value);
  }

  representativeLabel(representative: Representative): string {
    return `${representative.name} - ${representative.profession}`;
  }

  submitVote(): void {
    this.submissionError.set(null);
    this.submissionSuccess.set(null);
    this.dataLoadError.set(null);

    if (this.isLoadingData()) {
      this.submissionError.set('Az adatok betöltése még folyamatban van.');
      return;
    }

    if (this.form.invalid) {
      Object.values(this.form.controls).forEach(control => {
        control.markAsDirty();
        control.updateValueAndValidity();
      });
      return;
    }

    this.isSubmitting.set(true);
    this.votingApi.submitVote(this.form.getRawValue() as VoteRequest).subscribe({
      next: result => {
        this.isSubmitting.set(false);
        this.submissionSuccess.set(result.confirmation);
      },
      error: (error: Error) => {
        this.isSubmitting.set(false);
        this.submissionError.set(error.message);
      }
    });
  }

  private resetRepresentative(): void {
    this.submissionError.set(null);
    this.submissionSuccess.set(null);
    this.form.controls.representativeId.reset('');
  }

  private loadReferenceData(): void {
    this.isLoadingData.set(true);
    this.dataLoadError.set(null);

    forkJoin({
      counties: this.votingApi.getCounties(),
      parties: this.votingApi.getParties(),
      representatives: this.votingApi.getRepresentatives()
    }).subscribe({
      next: ({ counties, parties, representatives }) => {
        this.counties = counties;
        this.parties = parties;
        this.representatives = representatives;
        this.isLoadingData.set(false);
      },
      error: () => {
        this.isLoadingData.set(false);
        this.dataLoadError.set(
          'Nem sikerült betölteni a megyéket, pártokat és képviselőket az adatforrásból. Ellenőrizd, hogy az API eléri-e a PRIM szerveren lévő Projekt adatbázist.'
        );
      }
    });
  }

  private hungarianNameValidator(control: AbstractControl<string>): ValidationErrors | null {
    const value = control.value?.trim() ?? '';
    return /^[A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű][A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű .'-]{1,}$/.test(value)
      ? null
      : { hungarianName: true };
  }
}
