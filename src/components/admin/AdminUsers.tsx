import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { User, ClientProfile } from '../../types';
import {
  Users,
  Search,
  Plus,
  Edit2,
  Power,
  KeyRound,
  ShieldCheck,
  Building,
  Mail,
  Phone,
  X,
  Save
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

export const AdminUsers: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const toast = useToast();

  // Create User Form State
  const [newUser, setNewUser] = useState({
    email: '',
    motDePasse: '',
    nom: '',
    telephone: '',
    role: 'CLIENT' as 'ADMIN' | 'CLIENT',
    idClient: ''
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadData();
  }, [search, roleFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [uRes, cRes] = await Promise.all([
        api.getAdminUsers({ search: search || undefined, role: roleFilter || undefined }),
        api.getAdminClients()
      ]);
      const rawUsers = uRes.donnees?.users;
      const rawClients = cRes.donnees?.clients;
      setUsers(Array.isArray(rawUsers) ? rawUsers : []);
      setClients(Array.isArray(rawClients) ? rawClients : []);
    } catch (e: any) {
      toast.error('Erreur', e.message);
      setUsers([]);
      setClients([]);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (u: User) => {
    const nextStatus = u.actif === 'OUI' ? 'NON' : 'OUI';
    try {
      const res = await api.toggleAdminUser(u.idUser, nextStatus);
      if (res.donnees) {
        setUsers((prev) => prev.map((item) => (item.idUser === u.idUser ? res.donnees : item)));
        toast.success(`Compte ${u.nom} ${nextStatus === 'OUI' ? 'activé' : 'désactivé'}`);
      }
    } catch (e: any) {
      toast.error('Erreur', e.message);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.email || !newUser.motDePasse) return;
    setCreating(true);
    try {
      const res = await api.createAdminUser(newUser);
      if (res.donnees) {
        toast.success('Utilisateur créé', `Le compte de ${res.donnees.nom} a été créé.`);
        setCreateModalOpen(false);
        setNewUser({
          email: '',
          motDePasse: '',
          nom: '',
          telephone: '',
          role: 'CLIENT',
          idClient: ''
        });
        loadData();
      }
    } catch (e: any) {
      toast.error('Erreur', e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    try {
      const res = await api.updateAdminUser({
        idUser: editUser.idUser,
        nom: editUser.nom,
        telephone: editUser.telephone,
        role: editUser.role,
        idClient: editUser.idClient
      });
      if (res.donnees) {
        setUsers((prev) => prev.map((u) => (u.idUser === editUser.idUser ? res.donnees : u)));
        setEditUser(null);
        toast.success('Utilisateur mis à jour');
      }
    } catch (e: any) {
      toast.error('Erreur', e.message);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPasswordUser || !newPassword) return;
    try {
      await api.resetAdminUserPassword({
        idUser: resetPasswordUser.idUser,
        nouveauMotDePasse: newPassword
      });
      toast.success('Mot de passe réinitialisé avec succès');
      setResetPasswordUser(null);
      setNewPassword('');
    } catch (e: any) {
      toast.error('Erreur', e.message);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Gestion des Utilisateurs
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Attribution des rôles administrateurs et accès clients aux tableaux de bord de veille.
          </p>
        </div>

        <button
          onClick={() => setCreateModalOpen(true)}
          className="flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 transition-colors shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Créer un Utilisateur</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom ou email..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600/30 focus:border-teal-600"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setRoleFilter('')}
            className={`py-2 px-3 rounded-xl text-xs font-medium border transition-colors ${
              roleFilter === ''
                ? 'border-teal-600 bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400'
            }`}
          >
            Tous ({users.length})
          </button>
          <button
            onClick={() => setRoleFilter('ADMIN')}
            className={`py-2 px-3 rounded-xl text-xs font-medium border transition-colors ${
              roleFilter === 'ADMIN'
                ? 'border-teal-600 bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400'
            }`}
          >
            Admins
          </button>
          <button
            onClick={() => setRoleFilter('CLIENT')}
            className={`py-2 px-3 rounded-xl text-xs font-medium border transition-colors ${
              roleFilter === 'CLIENT'
                ? 'border-teal-600 bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400'
            }`}
          >
            Clients
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 uppercase text-[10px] tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-4">Utilisateur</th>
                <th className="py-3 px-4">Rôle</th>
                <th className="py-3 px-4">Entreprise Associée</th>
                <th className="py-3 px-4">Téléphone</th>
                <th className="py-3 px-4">Statut</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(Array.isArray(users) ? users : []).map((u) => {
                const safeClients = Array.isArray(clients) ? clients : [];
                const assignedClient = safeClients.find((c) => c.idClient === u.idClient);
                return (
                  <tr key={u.idUser} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="space-y-0.5">
                        <p className="font-bold text-slate-900 dark:text-white">{u.nom}</p>
                        <p className="text-[11px] text-slate-500 font-mono">{u.email}</p>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                          u.role === 'ADMIN'
                            ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                            : 'bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200 dark:border-teal-800'
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300">
                      {assignedClient ? (
                        <span className="font-semibold text-teal-800 dark:text-teal-300">
                          {assignedClient.nom}
                        </span>
                      ) : u.role === 'ADMIN' ? (
                        <span className="text-slate-400 italic">Toutes entreprises (Système)</span>
                      ) : (
                        <span className="text-slate-400 italic">Non assigné</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-400">
                      {u.telephone || '—'}
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                          u.actif === 'OUI'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                            : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                        }`}
                      >
                        {u.actif === 'OUI' ? 'ACTIF' : 'SUSPENDU'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setResetPasswordUser(u)}
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                          title="Réinitialiser le mot de passe"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => setEditUser(u)}
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                          title="Modifier"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleToggleActive(u)}
                          className={`p-1.5 rounded-lg border transition-colors ${
                            u.actif === 'OUI'
                              ? 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                              : 'border-rose-200 text-rose-600 hover:bg-rose-50'
                          }`}
                          title={u.actif === 'OUI' ? 'Suspendre' : 'Activer'}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE MODAL */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in">
            <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Créer un Nouveau Compte
              </h3>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nom et Prénom *
                </label>
                <input
                  type="text"
                  required
                  value={newUser.nom}
                  onChange={(e) => setNewUser({ ...newUser, nom: e.target.value })}
                  placeholder="Jean-Paul Nkouba"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Adresse email (Login) *
                </label>
                <input
                  type="email"
                  required
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  placeholder="jp.nkouba@entreprise.cm"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Mot de passe provisoire *
                </label>
                <input
                  type="password"
                  required
                  value={newUser.motDePasse}
                  onChange={(e) => setNewUser({ ...newUser, motDePasse: e.target.value })}
                  placeholder="Minimum 6 caractères"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Téléphone
                </label>
                <input
                  type="tel"
                  value={newUser.telephone}
                  onChange={(e) => setNewUser({ ...newUser, telephone: e.target.value })}
                  placeholder="+237 6XX XX XX XX"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Rôle
                  </label>
                  <select
                    value={newUser.role}
                    onChange={(e) => setNewUser({ ...newUser, role: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                  >
                    <option value="CLIENT">CLIENT</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Entreprise cliente
                  </label>
                  <select
                    value={newUser.idClient}
                    onChange={(e) => setNewUser({ ...newUser, idClient: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                  >
                    <option value="">-- Aucune --</option>
                    {(Array.isArray(clients) ? clients : []).map((c) => (
                      <option key={c.idClient} value={c.idClient}>
                        {c.nom}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="py-2 px-4 rounded-xl font-semibold text-slate-600 dark:text-slate-300"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="py-2 px-5 rounded-xl font-semibold text-white bg-teal-700 hover:bg-teal-800 transition-colors disabled:opacity-50"
                >
                  {creating ? 'Création...' : 'Créer l’accès'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESET PASSWORD MODAL */}
      {resetPasswordUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Réinitialiser le mot de passe
            </h3>
            <p className="text-xs text-slate-500">
              Définir un nouveau mot de passe pour {resetPasswordUser.nom} ({resetPasswordUser.email}).
            </p>

            <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nouveau mot de passe
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Nouveau mot de passe"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResetPasswordUser(null)}
                  className="py-1.5 px-3 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="py-1.5 px-4 rounded-lg text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800"
                >
                  Valider
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
