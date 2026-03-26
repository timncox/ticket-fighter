import type { CityAdapter, CityId } from "./types.js";

const adapters = new Map<CityId, CityAdapter>();

export function registerAdapter(adapter: CityAdapter): void {
  adapters.set(adapter.cityId, adapter);
}

export function getAdapter(city: CityId): CityAdapter {
  const adapter = adapters.get(city);
  if (!adapter) {
    throw new Error(`No adapter registered for city: ${city}. Supported cities: ${[...adapters.keys()].join(", ")}`);
  }
  return adapter;
}

export function getAllAdapters(): CityAdapter[] {
  return [...adapters.values()];
}
