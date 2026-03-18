import axios from 'axios';
import { config } from '../config';
import { Deal } from '../types';

const BASE_URL = 'https://www.cheapshark.com/api/1.0';

export async function fetchSteamDeals(options: {
  maxPrice: number;
  pageSize: number;
}): Promise<Deal[]> {
  const { data } = await axios.get<Deal[]>(`${BASE_URL}/deals`, {
    params: {
      storeID: '1',
      upperPrice: options.maxPrice,
      sortBy: 'Savings',
      onSale: 1,
      pageSize: options.pageSize,
      // ⚠️ No se filtra por metacritic aquí — lo hace rulesFilter con lógica OR
    },
    timeout: config.http.cheapsharkTimeoutMs,
  });
  return data;
}
