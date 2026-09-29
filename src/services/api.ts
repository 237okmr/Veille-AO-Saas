import {
  ApiResponse,
  User,
  ClientProfile,
  ClientPreferences,
  ClientPreferencesData,
  AdminClientAlertItem,
  AdminClientCacheIaItem,
  AdminClientAuditItem,
  TenderAlert,
  AlertNote,
  SourceFraicheur,
  SavedSearch,
  AlertCounts,
  ClientDashboardStats,
  RegionStat,
  ProcedureStat,
  TimelineStat,
  TopMO,
  AdminStats,
  PipelineAction,
  AuditLogItem,
  SessionItem,
  AlertFilterOptions,
  ApiConfigInfo,
  ReglagesData,
  ReglagesParametres,
  PublicRadarData
} from '../types';

const TOKEN_KEY = 'cam_marches_token';

export const getToken = (): string | null => {
  return localStorage.getItem('token') || localStorage.getItem(TOKEN_KEY);
};

export const setToken = (token: string): void => {
  localStorage.setItem('token', token);
  localStorage.setItem(TOKEN_KEY, token);
};

export const removeToken = (): void => {
  localStorage.removeItem('token');
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem('user');
  localStorage.removeItem('cam_marches_user');
};

export const getStoredUser = (): User | null => {
  try {
    const raw = localStorage.getItem('user') || localStorage.getItem('cam_marches_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const setStoredUser = (user: User): void => {
  try {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('cam_marches_user', JSON.stringify(user));
  } catch {
    // ignore
  }
};

// Event dispatcher for unauthorized 401 redirection
export const onUnauthorized = () => {
  removeToken();
  window.dispatchEvent(new CustomEvent('auth:unauthorized'));
};

export interface RequestOptions extends RequestInit {
  token?: string;
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
  const token = options.token || getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const url = endpoint.startsWith('/') ? `/api${endpoint}` : `/api/${endpoint}`;

  let res: Response;
  try {
    const { token: _tokenOption, ...fetchOptions } = options;
    res = await fetch(url, {
      ...fetchOptions,
      headers
    });
  } catch {
    // Si erreur réseau
    throw new Error("Erreur réseau, vérifiez votre connexion");
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    if (res.status === 401) {
      throw new Error("Email ou mot de passe incorrect");
    }
    throw new Error(`Erreur serveur (${res.status})`);
  }

  // Si code 401
  if (res.status === 401 || data?.code === 401) {
    if (!endpoint.includes('/auth/login') && !endpoint.includes('/auth/lien')) {
      onUnauthorized();
    }
    throw new Error(data?.message || "Email ou mot de passe incorrect");
  }

  // Vérifier le succès : response.succes === true (pas response.success)
  if (data?.succes !== true) {
    // Si succes=false → afficher response.message (pas un message générique)
    const errorMsg = data?.message || (res.status === 401 ? "Email ou mot de passe incorrect" : "Erreur de traitement");
    throw new Error(errorMsg);
  }

  return data as ApiResponse<T>;
}

export const api = {
  // CONFIG & PUBLIC RADAR
  getConfig: () => request<ApiConfigInfo>('/config'),
  getPublicRadarTicker: () => request<PublicRadarData>('/public/radar-ticker'),

  // AUTH
  login: (email: string, motDePasse: string) =>
    request<User>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ route: '/auth/login', email, motDePasse })
    }),

  loginParLien: (jeton: string) =>
    request<User>('/auth/lien', {
      method: 'POST',
      body: JSON.stringify({ route: '/auth/lien', jeton })
    }),

  register: (payload: { email: string; motDePasse: string; nom: string; telephone?: string; langue?: string }) =>
    request<User>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ route: '/auth/register', ...payload })
    }),

  verify: (tokenParam?: string) => {
    return request<User>('/auth/verify', tokenParam ? { token: tokenParam } : {});
  },

  logout: () => {
    return request<null>('/auth/logout', {
      method: 'POST'
    });
  },

  // CLIENT PROFILE & ACCOUNT
  getClientProfile: () => request<ClientProfile>('/client/profile'),

  updateClientProfile: (payload: Partial<ClientProfile>) =>
    request<ClientProfile>('/client/profile/update', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  updatePromptMetier: (promptMetier: string) =>
    request<ClientProfile>('/client/profile/prompt', {
      method: 'POST',
      body: JSON.stringify({ promptMetier })
    }),

  updateSiteWeb: (siteWeb: string) =>
    request<ClientProfile>('/client/profile/site', {
      method: 'POST',
      body: JSON.stringify({ siteWeb })
    }),

  regenerateAiProfile: () =>
    request<ClientProfile>('/client/profile/regenerate', {
      method: 'POST'
    }),

  getPreferences: () => request<ClientPreferences>('/client/preferences'),

  updatePreferences: (payload: Partial<ClientPreferences>) =>
    request<ClientPreferences>('/client/preferences', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  updateAccount: (payload: { nom?: string; telephone?: string; langue?: string }) =>
    request<User>('/client/account/update', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  updatePassword: (payload: { ancienMotDePasse: string; nouveauMotDePasse: string }) =>
    request<null>('/client/account/password', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  // CLIENT ALERTS
  getAlerts: (filters: AlertFilterOptions = {}) => {
    const query = new URLSearchParams();
    if (filters.statut) query.set('statut', filters.statut);
    if (filters.etat) query.set('etat', filters.etat);
    if (filters.lu !== undefined) query.set('lu', filters.lu);
    if (filters.expire) query.set('expire', filters.expire);
    if (filters.region) query.set('region', filters.region);
    if (filters.procedure) query.set('procedure', filters.procedure);
    if (filters.scoreMin) query.set('scoreMin', String(filters.scoreMin));
    if (filters.search) query.set('search', filters.search);
    if (filters.dateFrom) query.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) query.set('dateTo', filters.dateTo);
    if (filters.sortBy) query.set('sortBy', filters.sortBy);
    if (filters.sortOrder) query.set('sortOrder', filters.sortOrder);
    if (filters.limit) query.set('limit', String(filters.limit));
    if (filters.offset) query.set('offset', String(filters.offset));

    const qs = query.toString();
    return request<{ total: number; limit: number; offset: number; count: number; alertes: TenderAlert[] }>(
      `/client/alerts${qs ? `?${qs}` : ''}`
    );
  },

  getAlertDetail: (idMatch: string) =>
    request<TenderAlert>(`/client/alerts/detail?idMatch=${encodeURIComponent(idMatch)}`),

  getAlertCounts: () => request<AlertCounts>('/client/alerts/count'),

  getSources: () => request<{ sources: SourceFraicheur[] }>('/client/sources'),

  getSavedSearches: () => request<{ total: number; recherches: SavedSearch[] }>('/client/alerts/saved-searches'),

  createSavedSearch: (payload: { nom: string; filtres: AlertFilterOptions }) =>
    request<SavedSearch>('/client/alerts/saved-searches', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  toggleSavedSearch: (payload: { idRecherche: string; actif: 'OUI' | 'NON' }) =>
    request<{ idRecherche: string; actif: string }>('/client/alerts/saved-searches/toggle', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  markAlert: (payload: { idMatch: string; etat: TenderAlert['etat']; note?: string }) =>
    request<TenderAlert>('/client/alerts/mark', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  setAlertDecision: (payload: { idMatch: string; decision: 'GO' | 'NOGO' | 'EN_ATTENTE'; justification?: string; lienDaoComplementaire?: string }) =>
    request<{ idMatch: string; decision: string; decisionJustification: string; decisionLienComplementaire: string; decisionPar: string; dateDecision: string }>('/client/alerts/decision', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  getAlertNotes: (idMatch: string) =>
    request<{ idMatch: string; total: number; notes: AlertNote[] }>(`/client/alerts/notes?idMatch=${encodeURIComponent(idMatch)}`),

  addAlertNote: (payload: { idMatch: string; texte: string }) =>
    request<{ idMatch: string; note: AlertNote }>('/client/alerts/notes', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  exportAlerts: (filters: AlertFilterOptions = {}) =>
    request<{ format: string; nomFichier: string; count: number; contenu: string }>('/client/alerts/export', {
      method: 'POST',
      body: JSON.stringify(filters)
    }),

  // CLIENT STATS
  getClientDashboardStats: (jours = 30) =>
    request<ClientDashboardStats>(`/client/stats/dashboard?jours=${jours}`),

  getStatsByRegion: (jours = 90) =>
    request<RegionStat[]>(`/client/stats/by-region?jours=${jours}`),

  getStatsByProcedure: (jours = 90) =>
    request<ProcedureStat[]>(`/client/stats/by-procedure?jours=${jours}`),

  getStatsTimeline: (jours = 30) =>
    request<TimelineStat[]>(`/client/stats/timeline?jours=${jours}`),

  getTopMO: (jours = 90, limit = 10) =>
    request<TopMO[]>(`/client/stats/top-mo?jours=${jours}&limit=${limit}`),

  // ADMIN ENDPOINTS
  getAdminStats: () => request<AdminStats>('/admin/stats'),

  getAdminClients: (params: { search?: string; actif?: string; limit?: number; offset?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.actif) q.set('actif', params.actif);
    if (params.limit) q.set('limit', String(params.limit));
    if (params.offset) q.set('offset', String(params.offset));
    const qs = q.toString();
    return request<{ total: number; clients: ClientProfile[] }>(`/admin/clients${qs ? `?${qs}` : ''}`);
  },

  getAdminClientDetail: async (idClient: string) => {
    const res = await request<any>(`/admin/clients/detail?idClient=${encodeURIComponent(idClient)}`);
    if (res.donnees) {
      const raw = res.donnees;
      if (raw.client) {
        return {
          ...res,
          donnees: {
            ...raw.client,
            idClient: raw.client.idClient || raw.idClient || idClient,
            nom: raw.client.nom || raw.client.nomEntreprise || '',
            nomEntreprise: raw.client.nomEntreprise || raw.client.nom || '',
            actif: raw.client.actif || 'OUI',
            profilIA: raw.profilIA || raw.client.profilIA,
            preferences: raw.preferences || raw.client.preferences,
            utilisateurs: raw.utilisateurs || raw.client.utilisateurs,
            abonnement: raw.abonnement || raw.client.abonnement,
            factures: raw.factures || raw.client.factures
          } as ClientProfile
        };
      }
    }
    return res as ApiResponse<ClientProfile>;
  },

  createAdminClient: (payload: Partial<ClientProfile> & { genererProfilIA?: boolean }) =>
    request<ClientProfile>('/admin/clients/create', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  updateAdminClient: (payload: Partial<ClientProfile> & { idClient: string }) =>
    request<ClientProfile>('/admin/clients/update', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  toggleAdminClient: (idClient: string, actif: 'OUI' | 'NON') =>
    request<ClientProfile>('/admin/clients/toggle', {
      method: 'POST',
      body: JSON.stringify({ idClient, actif })
    }),

  regenerateAdminClientAi: (idClient: string) =>
    request<ClientProfile>('/admin/clients/regenerate', {
      method: 'POST',
      body: JSON.stringify({ idClient })
    }),

  updateAdminClientIaProfile: (payload: {
    idClient: string;
    motsClesInclusion: string[];
    motsClesExclusion: string[];
    moPrioritaires: string[];
  }) =>
    request<{ idClient: string; modifie?: string[] }>('/admin/clients/update-ia-profile', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  toggleAdminClientCascade: (idClient: string, actif: 'OUI' | 'NON') =>
    request<{
      idClient: string;
      actif: 'OUI' | 'NON';
      nbUsersModifies?: number;
      nbSessionsInvalidees?: number;
    }>('/admin/clients/toggle-cascade', {
      method: 'POST',
      body: JSON.stringify({ idClient, actif })
    }),

  getAdminClientAlerts: (params: {
    idClient: string;
    limit?: number;
    offset?: number;
    statut?: string;
    scoreMin?: number;
    search?: string;
  }) => {
    const q = new URLSearchParams();
    q.set('idClient', params.idClient);
    if (params.limit !== undefined) q.set('limit', String(params.limit));
    if (params.offset !== undefined) q.set('offset', String(params.offset));
    if (params.statut) q.set('statut', params.statut);
    if (params.scoreMin !== undefined) q.set('scoreMin', String(params.scoreMin));
    if (params.search) q.set('search', params.search);
    return request<{
      total: number;
      limit: number;
      offset: number;
      count?: number;
      alertes: AdminClientAlertItem[];
    }>(`/admin/clients/alerts?${q.toString()}`);
  },

  getAdminClientCacheIa: (params: { idClient: string; limit?: number; offset?: number }) => {
    const q = new URLSearchParams();
    q.set('idClient', params.idClient);
    if (params.limit !== undefined) q.set('limit', String(params.limit));
    if (params.offset !== undefined) q.set('offset', String(params.offset));
    return request<{
      total: number;
      evaluations: AdminClientCacheIaItem[];
    }>(`/admin/clients/cache-ia?${q.toString()}`);
  },

  getAdminClientAudit: (params: { idClient: string; limit?: number; offset?: number }) => {
    const q = new URLSearchParams();
    q.set('idClient', params.idClient);
    if (params.limit !== undefined) q.set('limit', String(params.limit));
    if (params.offset !== undefined) q.set('offset', String(params.offset));
    return request<{
      total: number;
      logs: AdminClientAuditItem[];
    }>(`/admin/clients/audit?${q.toString()}`);
  },

  getAdminClientPreferences: (idClient: string) => {
    return request<ClientPreferencesData>(`/admin/clients/preferences?idClient=${encodeURIComponent(idClient)}`);
  },

  updateAdminClientPreferences: (payload: {
    idClient: string;
    notifEmail: boolean;
    notifWhatsApp: boolean;
    notifInApp: boolean;
    whatsappNumero?: string;
    frequenceDigest?: string;
    heurePreferee?: string;
    langue?: string;
  }) =>
    request<ClientPreferencesData>('/admin/clients/preferences', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  getAdminUsers: (params: { role?: string; actif?: string; search?: string; limit?: number; offset?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.role) q.set('role', params.role);
    if (params.actif) q.set('actif', params.actif);
    if (params.search) q.set('search', params.search);
    if (params.limit) q.set('limit', String(params.limit));
    if (params.offset) q.set('offset', String(params.offset));
    const qs = q.toString();
    return request<{ total: number; users: User[] }>(`/admin/users${qs ? `?${qs}` : ''}`);
  },

  createAdminUser: (payload: { email: string; motDePasse: string; nom?: string; telephone?: string; role: 'ADMIN' | 'CLIENT'; idClient?: string }) =>
    request<User>('/admin/users/create', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  updateAdminUser: (payload: { idUser: string; nom?: string; telephone?: string; role?: 'ADMIN' | 'CLIENT'; idClient?: string }) =>
    request<User>('/admin/users/update', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  toggleAdminUser: (idUser: string, actif: 'OUI' | 'NON') =>
    request<User>('/admin/users/toggle', {
      method: 'POST',
      body: JSON.stringify({ idUser, actif })
    }),

  resetAdminUserPassword: (payload: { idUser?: string; email?: string; nouveauMotDePasse: string }) =>
    request<null>('/admin/users/reset-password', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  getAdminAuditLogs: (params: { search?: string; action?: string; succes?: string; limit?: number; offset?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.action) q.set('action', params.action);
    if (params.succes !== undefined) q.set('succes', params.succes);
    if (params.limit) q.set('limit', String(params.limit));
    if (params.offset) q.set('offset', String(params.offset));
    const qs = q.toString();
    return request<{ total: number; logs?: AuditLogItem[]; entrees?: AuditLogItem[] }>(`/admin/audit${qs ? `?${qs}` : ''}`);
  },

  getAdminSessions: (params: { actif?: string; idUser?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.actif) q.set('actif', params.actif);
    if (params.idUser) q.set('idUser', params.idUser);
    const qs = q.toString();
    return request<{ total: number; sessions: SessionItem[] }>(`/admin/sessions${qs ? `?${qs}` : ''}`);
  },

  invalidateSession: (idUser: string) =>
    request<null>('/admin/sessions/invalidate', {
      method: 'POST',
      body: JSON.stringify({ idUser })
    }),

  purgeExpiredSessions: () =>
    request<{ sessionsPurgees: number }>('/admin/sessions/purge', {
      method: 'POST'
    }),

  getReglages: () => request<ReglagesData>('/admin/reglages'),

  updateProxyMode: (mode: 'OFF' | 'OBSERVE' | 'ENFORCE') =>
    request<{ mode: string }>('/admin/reglages/proxy-mode', {
      method: 'POST',
      body: JSON.stringify({ mode })
    }),

  updateReglagesParametres: (payload: Partial<ReglagesParametres>) =>
    request<{ modifie: string[]; refuses: string[] }>('/admin/reglages/parametres', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  updateReglagesClesGemini: (payload: { cle1: string; cle2: string }) =>
    request<{ nbCles: number; masquees: string[] }>('/admin/reglages/cles-gemini', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  updateReglagesCleDeepSeek: (payload: { cle: string }) =>
    request<{ nbCles: number; masquees: string[] }>('/admin/reglages/cle-deepseek', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  getPipelineActions: () => request<{ actions: PipelineAction[] } | PipelineAction[]>('/admin/actions/list'),

  runPipelineAction: (code: string) =>
    request<{ code: string; statut?: string; dureeExecution?: string; dureeMs?: number; elementsTraites?: number; details?: string; label?: string; fonction?: string; retour?: any }>('/admin/actions/run', {
      method: 'POST',
      body: JSON.stringify({ code })
    }),

  // Diagnostic endpoints
  getDiagnosticStatus: () =>
    request<{
      apiUrlServer: string;
      apiUrlServerMasked: string;
      isConfigured: boolean;
      mode: string;
      directCalls: Array<{ file: string; line: number; snippet: string }>;
      serverLogs: Array<{ id: number; timestamp: string; level: 'info' | 'warn' | 'error'; message: string }>;
    }>('/diagnostic/status'),

  proxyGet: async (route: string, token?: string) => {
    const q = new URLSearchParams();
    q.set('route', route);
    const res = await fetch(`/api/proxy?${q.toString()}`, {
      headers: {
        'Accept': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    });
    const text = await res.text();
    try {
      return { status: res.status, ok: res.ok, data: JSON.parse(text), raw: text };
    } catch {
      return { status: res.status, ok: res.ok, data: null, raw: text };
    }
  },

  proxyPost: async (payload: Record<string, any>) => {
    const res = await fetch('/api/proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const text = await res.text();
    try {
      return { status: res.status, ok: res.ok, data: JSON.parse(text), raw: text };
    } catch {
      return { status: res.status, ok: res.ok, data: null, raw: text };
    }
  }
};
