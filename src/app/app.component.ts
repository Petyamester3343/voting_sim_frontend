import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DividerModule } from 'primeng/divider';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';

import { County, Party, Representative, VotingApiService, VoteRequest } from './voting-api.service';

const PID_PATTERN = /^\d{6}[A-Z]{2}$/;
type FormControlName = 'firstName' | 'lastName' | 'pid' | 'countyId' | 'sector' | 'partyId' | 'representativeId';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    CardModule,
    DividerModule,
    InputTextModule,
    SelectModule
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
  readonly sectorOptions = [
    { label: 'Körzet 1', value: 1 },
    { label: 'Körzet 2', value: 2 },
    { label: 'Körzet 3', value: 3 }
  ];

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

  constructor() {
    this.form.controls.countyId.valueChanges.subscribe(() => this.resetRepresentative());
    this.form.controls.sector.valueChanges.subscribe(() => this.resetRepresentative());
    this.form.controls.partyId.valueChanges.subscribe(() => this.resetRepresentative());
  }

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

  get selectedCounty(): County | undefined {
    return this.counties.find(county => county.id === this.form.controls.countyId.value);
  }

  get selectedParty(): Party | undefined {
    return this.parties.find(party => party.id === this.form.controls.partyId.value);
  }

  get selectedRepresentative(): Representative | undefined {
    return this.representatives.find(representative => representative.id === this.form.controls.representativeId.value);
  }

  isInvalid(controlName: FormControlName): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  submitVote(): void {
    this.submissionError.set(null);
    this.submissionSuccess.set(null);
    this.dataLoadError.set(null);

    if (this.isLoadingData()) {
      this.submissionError.set('Still loading data...');
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
          'Loading counties, paries, and candidates failed!'
        );
      }
    });
  }

  private hungarianNameValidator(control: AbstractControl<string>): ValidationErrors | null {
    const value = control.value?.trim() ?? '';
    return /^[A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű][A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű .'-]+$/.test(value)
      ? null
      : { hungarianName: true };
  }
}
