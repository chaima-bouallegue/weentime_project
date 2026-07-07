import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

export interface GeocodedAddress {
  address: string;
  city?: string;
  region?: string;
  country?: string;
}

@Injectable({
  providedIn: 'root'
})
export class GeocodingService {
  private readonly http = inject(HttpClient);
  
  private readonly cacheKeyPrefix = 'weentime_geocode_';
  private lastRequestTime = 0;

  /**
   * Reverse geocode a latitude and longitude pair.
   * Utilizes LocalStorage cache and handles rate limiting spacing.
   */
  geocode(latitude: number, longitude: number): Observable<GeocodedAddress> {
    const roundedLat = latitude.toFixed(4);
    const roundedLon = longitude.toFixed(4);
    const cacheKey = `${this.cacheKeyPrefix}${roundedLat}_${roundedLon}`;
    
    // Check localStorage cache
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        return of(JSON.parse(cached) as GeocodedAddress);
      }
    } catch (e) {
      console.warn('Error reading from localStorage cache:', e);
    }

    // Rate-limiting delay to space Nominatim calls (1 req/sec)
    const now = Date.now();
    const delay = Math.max(0, 1000 - (now - this.lastRequestTime));
    this.lastRequestTime = now + delay;

    return new Observable<GeocodedAddress>(observer => {
      setTimeout(() => {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&accept-language=fr`;
        this.http.get<any>(url, {
          headers: {
            'Accept': 'application/json'
          }
        }).pipe(
          map(res => {
            if (!res || !res.address) {
              throw new Error('Incomplete Nominatim response');
            }
            
            const addr = res.address;
            const road = addr.road || addr.suburb || addr.neighbourhood || addr.pedestrian || addr.building || '';
            const city = addr.city || addr.town || addr.village || addr.municipality || '';
            const region = addr.county || addr.state_district || addr.state || addr.governorate || '';
            const country = addr.country || '';
            
            // Format address: "road, city, region, country"
            const parts: string[] = [];
            if (road) parts.push(road);
            if (city) {
              parts.push(city);
            } else if (region) {
              parts.push(region);
            }
            if (country) parts.push(country);
            
            const formatted = parts.join(', ') || res.display_name || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
            
            return {
              address: formatted,
              city: city || undefined,
              region: region || undefined,
              country: country || undefined
            };
          }),
          tap(result => {
            try {
              localStorage.setItem(cacheKey, JSON.stringify(result));
            } catch (e) {
              console.warn('Error writing to localStorage cache:', e);
            }
          }),
          catchError(err => {
            return throwError(() => err);
          })
        ).subscribe({
          next: val => {
            observer.next(val);
            observer.complete();
          },
          error: err => {
            observer.error(err);
          }
        });
      }, delay);
    });
  }
}
