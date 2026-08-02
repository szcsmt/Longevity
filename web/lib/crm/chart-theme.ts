/* Plain (non-client) chart theme constants. These MUST live outside the
   'use client' charts module: a server component importing a data object from a
   client module receives a proxy reference, not the value, so `.sold` etc. would
   read undefined. Both the server page and the client charts import from here. */

export const STATUS_COLOR: Record<string, string> = { free: '#2ECC71', reserved: '#F1C40F', sold: '#E74C3C' };
export const STATUS_LABEL: Record<string, string> = { free: 'Szabad', reserved: 'Foglalt', sold: 'Eladva' };
export const SCORE_COLOR: Record<string, string> = { hot: '#E0774E', warm: '#D8B26A', cold: '#6FA0B5' };
export const SCORE_LABEL: Record<string, string> = { hot: 'Forró', warm: 'Langyos', cold: 'Hideg' };
