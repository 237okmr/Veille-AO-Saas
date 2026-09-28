import React, { useState, useMemo } from 'react';
import {
  Tag,
  Search,
  Plus,
  Trash2,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Building,
  Sparkles,
  X
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

interface TagBrowserProps {
  inclusions: string[];
  exclusions: string[];
  moPrioritaires: string[];
  isOverrideUnlocked: boolean;
  onUpdateTags?: (updated: {
    inclusions: string[];
    exclusions: string[];
    moPrioritaires: string[];
  }) => void;
}

type TagCategory = 'inclusions' | 'exclusions' | 'mo';

export const TagBrowser: React.FC<TagBrowserProps> = ({
  inclusions,
  exclusions,
  moPrioritaires,
  isOverrideUnlocked,
  onUpdateTags
}) => {
  const [activeCategory, setActiveCategory] = useState<TagCategory>('inclusions');
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;
  const toast = useToast();

  // Local state for tags
  const [localInclusions, setLocalInclusions] = useState<string[]>(inclusions);
  const [localExclusions, setLocalExclusions] = useState<string[]>(exclusions);
  const [localMo, setLocalMo] = useState<string[]>(moPrioritaires);

  // Sync if props change
  React.useEffect(() => {
    setLocalInclusions(inclusions);
  }, [inclusions]);
  React.useEffect(() => {
    setLocalExclusions(exclusions);
  }, [exclusions]);
  React.useEffect(() => {
    setLocalMo(moPrioritaires);
  }, [moPrioritaires]);

  // Tag modal / action popup
  const [selectedTag, setSelectedTag] = useState<{
    text: string;
    category: TagCategory;
  } | null>(null);

  // Add new tag input
  const [newTagInput, setNewTagInput] = useState('');

  // Active list based on category
  const currentList = useMemo(() => {
    if (activeCategory === 'inclusions') return localInclusions;
    if (activeCategory === 'exclusions') return localExclusions;
    return localMo;
  }, [activeCategory, localInclusions, localExclusions, localMo]);

  // Filtered by search
  const filteredList = useMemo(() => {
    if (!search.trim()) return currentList;
    const term = search.toLowerCase();
    return currentList.filter((item) => item.toLowerCase().includes(term));
  }, [currentList, search]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredList.length / pageSize));
  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredList.slice(start, start + pageSize);
  }, [filteredList, currentPage]);

  const handleCategoryChange = (cat: TagCategory) => {
    setActiveCategory(cat);
    setCurrentPage(1);
    setSearch('');
  };

  const handleCopyTag = async (tagText: string) => {
    try {
      await navigator.clipboard.writeText(tagText);
      toast.success('Copié !', `Le tag "${tagText}" a été copié.`);
      setSelectedTag(null);
    } catch {
      toast.error('Erreur', 'Impossible de copier.');
    }
  };

  const handleDeleteTag = (tagText: string, category: TagCategory) => {
    if (!isOverrideUnlocked) return;
    let nextInc = [...localInclusions];
    let nextExc = [...localExclusions];
    let nextMo = [...localMo];

    if (category === 'inclusions') {
      nextInc = nextInc.filter((t) => t !== tagText);
      setLocalInclusions(nextInc);
    } else if (category === 'exclusions') {
      nextExc = nextExc.filter((t) => t !== tagText);
      setLocalExclusions(nextExc);
    } else {
      nextMo = nextMo.filter((t) => t !== tagText);
      setLocalMo(nextMo);
    }

    if (onUpdateTags) {
      onUpdateTags({
        inclusions: nextInc,
        exclusions: nextExc,
        moPrioritaires: nextMo
      });
    }

    toast.info('Tag supprimé', `"${tagText}" a été retiré de la liste.`);
    setSelectedTag(null);
  };

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagInput.trim() || !isOverrideUnlocked) return;
    const tag = newTagInput.trim();

    let nextInc = [...localInclusions];
    let nextExc = [...localExclusions];
    let nextMo = [...localMo];

    if (activeCategory === 'inclusions') {
      if (nextInc.includes(tag)) {
        toast.warning('Déjà présent', `Le tag "${tag}" existe déjà.`);
        return;
      }
      nextInc = [tag, ...nextInc];
      setLocalInclusions(nextInc);
    } else if (activeCategory === 'exclusions') {
      if (nextExc.includes(tag)) {
        toast.warning('Déjà présent', `Le tag "${tag}" existe déjà.`);
        return;
      }
      nextExc = [tag, ...nextExc];
      setLocalExclusions(nextExc);
    } else {
      if (nextMo.includes(tag)) {
        toast.warning('Déjà présent', `Le maître d'ouvrage "${tag}" existe déjà.`);
        return;
      }
      nextMo = [tag, ...nextMo];
      setLocalMo(nextMo);
    }

    if (onUpdateTags) {
      onUpdateTags({
        inclusions: nextInc,
        exclusions: nextExc,
        moPrioritaires: nextMo
      });
    }

    setNewTagInput('');
    toast.success('Tag ajouté', `"${tag}" a été ajouté.`);
  };

  const categoryStyles = {
    inclusions: {
      badgeBg: 'bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/80 text-emerald-800 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800',
      activeTab: 'bg-emerald-600 text-white',
      countBg: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
    },
    exclusions: {
      badgeBg: 'bg-red-100 hover:bg-red-200 dark:bg-red-950/60 dark:hover:bg-red-900/80 text-red-800 dark:text-red-200 border-red-300 dark:border-red-800',
      activeTab: 'bg-red-600 text-white',
      countBg: 'bg-red-500/20 text-red-700 dark:text-red-300'
    },
    mo: {
      badgeBg: 'bg-blue-100 hover:bg-blue-200 dark:bg-blue-950/60 dark:hover:bg-blue-900/80 text-blue-800 dark:text-blue-200 border-blue-300 dark:border-blue-800',
      activeTab: 'bg-blue-600 text-white',
      countBg: 'bg-blue-500/20 text-blue-700 dark:text-blue-300'
    }
  }[activeCategory];

  return (
    <div className="space-y-4">
      {/* Category Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => handleCategoryChange('inclusions')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-2 transition-all ${
              activeCategory === 'inclusions'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Inclusions Détectées</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/15 font-extrabold">
              {localInclusions.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleCategoryChange('exclusions')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-2 transition-all ${
              activeCategory === 'exclusions'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Exclusions Filtrées</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/15 font-extrabold">
              {localExclusions.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleCategoryChange('mo')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-2 transition-all ${
              activeCategory === 'mo'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Building className="w-3.5 h-3.5" />
            <span>MO Prioritaires</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/15 font-extrabold">
              {localMo.length}
            </span>
          </button>
        </div>

        {/* Real-time search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Rechercher un mot-clé..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Add Tag Row if Override Unlocked */}
      {isOverrideUnlocked && (
        <form onSubmit={handleAddTag} className="flex items-center space-x-2 animate-fadeIn">
          <input
            type="text"
            placeholder={`Ajouter un nouveau terme dans ${
              activeCategory === 'inclusions' ? 'Inclusions' : activeCategory === 'exclusions' ? 'Exclusions' : 'MO Prioritaires'
            }...`}
            value={newTagInput}
            onChange={(e) => setNewTagInput(e.target.value)}
            className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500"
          />
          <button
            type="submit"
            disabled={!newTagInput.trim()}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center space-x-1 disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Ajouter</span>
          </button>
        </form>
      )}

      {/* Tags Cloud Display */}
      <div className="min-h-[160px] p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
        {paginatedList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-slate-400 text-xs">
            <Tag className="w-8 h-8 mb-2 opacity-40" />
            <p>Aucun mot-clé ne correspond à votre recherche "{search}".</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {paginatedList.map((tag, idx) => (
              <button
                key={`${tag}-${idx}`}
                type="button"
                onClick={() => setSelectedTag({ text: tag, category: activeCategory })}
                className={`px-2.5 py-1 rounded-xl text-xs font-medium border shadow-xs transition-all flex items-center space-x-1.5 group ${categoryStyles.badgeBg}`}
              >
                <span>{tag}</span>
                {isOverrideUnlocked && (
                  <span className="text-red-500/70 hover:text-red-600 font-bold ml-1">×</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Pagination Footer */}
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
        <span>
          Affichage de {paginatedList.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} à{' '}
          {Math.min(currentPage * pageSize, filteredList.length)} sur {filteredList.length} tags
        </span>

        {totalPages > 1 && (
          <div className="flex items-center space-x-1.5">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => p - 1)}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-mono font-bold text-slate-700 dark:text-slate-300">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Tag Click Action Dialog */}
      {selectedTag && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Action sur le mot-clé
              </span>
              <button
                onClick={() => setSelectedTag(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-mono text-xs font-bold text-slate-900 dark:text-white select-all text-center">
              "{selectedTag.text}"
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => handleCopyTag(selectedTag.text)}
                className="py-2 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copier</span>
              </button>

              {isOverrideUnlocked ? (
                <button
                  type="button"
                  onClick={() => handleDeleteTag(selectedTag.text, selectedTag.category)}
                  className="py-2 px-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Supprimer</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setSelectedTag(null)}
                  className="py-2 px-3 bg-slate-900 dark:bg-emerald-600 text-white rounded-xl text-xs font-semibold"
                >
                  Fermer
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
