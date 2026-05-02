import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface County {
  id: string;
  name: string;
}

export interface Party {
  id: string;
  name: string;
}

export interface Representative {
  id: string;
  name: string;
  profession: string;
  countyId: string;
  sector: 1 | 2 | 3;
  partyId: string;
}

export interface VoteRequest {
  firstName: string;
  lastName: string;
  pid: string;
  countyId: string;
  sector: 1 | 2 | 3;
  partyId: string;
  representativeId: string;
}

export interface VoteResponse {
  confirmation: string;
}

@Injectable({ providedIn: 'root' })
export class VotingApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api';

  getCounties(): Observable<County[]> {
    return this.http.get<County[]>(`${this.baseUrl}/counties`);
  }

  getParties(): Observable<Party[]> {
    return this.http.get<Party[]>(`${this.baseUrl}/parties`);
  }

  getRepresentatives(): Observable<Representative[]> {
    return this.http.get<Representative[]>(`${this.baseUrl}/representatives`);
  }

  submitVote(request: VoteRequest): Observable<VoteResponse> {
    return this.http.post<VoteResponse>(`${this.baseUrl}/votes`, request);
  }
}
