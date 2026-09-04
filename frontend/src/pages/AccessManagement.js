import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck, Check, Users, Crown, Plus, X, Save, UserPlus, ChevronDown, Edit2, Trash2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';

const AccessManagement = () => {
    const { user } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();

    // State
    const [users, setUsers] = useState([]);
    const [pages, setPages] = useState([]);
    const [selectedUserId, setSelectedUserId] = useState('');
    const [selectedUser, setSelectedUser] = useState(null);
    const [permissions, setPermissions] = useState({});
    const [hasCustomPermissions, setHasCustomPermissions] = useState(false);
    const [loadingUsers, setLoadingUsers] = useState(true);
    const [loadingPerms, setLoadingPerms] = useState(false);
    const [saving, setSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    // Create User Modal State
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newUserForm, setNewUserForm] = useState({
        full_name: '',
        email: '',
        password: '',
        role: 'user'
    });
    const [creatingUser, setCreatingUser] = useState(false);

    // Edit User Modal State
    const [showEditModal, setShowEditModal] = useState(false);
    const [editUserForm, setEditUserForm] = useState({
        full_name: '',
        email: '',
        password: '',
        role: 'user'
    });
    const [updatingUser, setUpdatingUser] = useState(false);
    const [deletingUser, setDeletingUser] = useState(false);

    // Fetch users and pages on mount
    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                setLoadingUsers(true);
                const [usersRes, pagesRes] = await Promise.all([
                    api.get('/users'),
                    api.get('/pages')
                ]);
                setUsers(usersRes.data);
                setPages(pagesRes.data);
            } catch (error) {
                toast.error('Failed to load data');
                console.error(error);
            } finally {
                setLoadingUsers(false);
            }
        };

        fetchInitialData();
    }, []);

    // Fetch permissions when a user is selected
    const fetchUserPermissions = useCallback(async (userId) => {
        if (!userId) return;
        try {
            setLoadingPerms(true);
            const res = await api.get(`/users/${userId}/permissions`);
            setPermissions(res.data.permissions || {});
            setHasCustomPermissions(res.data.has_custom_permissions || false);
            setIsDirty(false);
        } catch (error) {
            toast.error('Failed to load permissions');
            console.error(error);
        } finally {
            setLoadingPerms(false);
        }
    }, []);

    const handleUserChange = (e) => {
        const userId = e.target.value;
        setSelectedUserId(userId);
        const foundUser = users.find(u => String(u.id) === String(userId));
        setSelectedUser(foundUser || null);
        if (userId) {
            fetchUserPermissions(userId);
        } else {
            setPermissions({});
            setSelectedUser(null);
            setIsDirty(false);
        }
    };

    const togglePage = (pagePath) => {
        setPermissions(prev => {
            const current = prev[pagePath] || { enabled: false, features: [] };
            const enabled = !current.enabled;
            const pageData = pages.find(p => p.path === pagePath);
            const allFeatures = pageData?.features?.map(f => f.id) || [];

            setIsDirty(true);
            return {
                ...prev,
                [pagePath]: {
                    ...current,
                    enabled,
                    features: enabled ? allFeatures : []
                }
            };
        });
    };

    const toggleFeature = (pagePath, featureId) => {
        setPermissions(prev => {
            const current = prev[pagePath] || { enabled: true, features: [] };
            const isCurrentlySelected = current.features.includes(featureId);

            const newFeatures = isCurrentlySelected
                ? current.features.filter(f => f !== featureId)
                : [...current.features, featureId];

            setIsDirty(true);
            return {
                ...prev,
                [pagePath]: {
                    ...current,
                    features: newFeatures
                }
            };
        });
    };

    const selectAll = () => {
        const availablePages = pages.filter(p => p.path !== '/access-management');
        const newPerms = {};
        availablePages.forEach(p => {
            newPerms[p.path] = {
                enabled: true,
                features: p.features ? p.features.map(f => f.id) : []
            };
        });
        setPermissions(newPerms);
        setIsDirty(true);
    };

    const deselectAll = () => {
        setPermissions({});
        setIsDirty(true);
    };

    const handleSave = async () => {
        if (!selectedUserId) return;

        const validationErrors = [];
        pages.forEach((page) => {
            const hasSubFeatures = Array.isArray(page.features) && page.features.length > 0;
            const pagePerm = permissions[page.path];
            if (!hasSubFeatures || !pagePerm?.enabled) return;
            if (!Array.isArray(pagePerm.features) || pagePerm.features.length === 0) {
                validationErrors.push(`${page.name} requires at least one feature`);
            }
        });

        if (validationErrors.length > 0) {
            toast.error(validationErrors[0]);
            return;
        }

        try {
            setSaving(true);
            await api.put(`/users/${selectedUserId}/permissions`, {
                permissions: permissions
            });
            setHasCustomPermissions(true);
            setIsDirty(false);
            toast.success(`Permissions updated for ${selectedUser?.full_name || 'user'}`);
        } catch (error) {
            const msg = error.response?.data?.message || 'Failed to save permissions';
            toast.error(msg);
        } finally {
            setSaving(false);
        }
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        try {
            setCreatingUser(true);
            await api.post('/users', newUserForm);

            toast.success(`User ${newUserForm.full_name} created successfully!`);

            const usersRes = await api.get('/users');
            setUsers(usersRes.data);

            setShowCreateModal(false);
            setNewUserForm({
                full_name: '',
                email: '',
                password: '',
                role: 'user'
            });
        } catch (error) {
            const msg = error.response?.data?.message || 'Failed to create user. Email may already exist.';
            toast.error(msg);
        } finally {
            setCreatingUser(false);
        }
    };

    const handleEditUserClick = () => {
        if (!selectedUser) return;
        setEditUserForm({
            full_name: selectedUser.full_name,
            email: selectedUser.email,
            password: '', // Blank password means don't change it
            role: selectedUser.role
        });
        setShowEditModal(true);
    };

    const handleUpdateUser = async (e) => {
        e.preventDefault();
        if (!selectedUser) return;

        try {
            setUpdatingUser(true);
            const payload = { ...editUserForm };
            // If password is empty, remove it from the payload
            if (!payload.password) {
                delete payload.password;
            }

            await api.put(`/users/${selectedUser.id}`, payload);
            toast.success(`User updated successfully!`);

            // Refresh user list
            const usersRes = await api.get('/users');
            setUsers(usersRes.data);

            // Update selected user state
            const updatedUser = usersRes.data.find(u => u.id === selectedUser.id);
            setSelectedUser(updatedUser);

            setShowEditModal(false);
        } catch (error) {
            const msg = error.response?.data?.message || 'Failed to update user.';
            toast.error(msg);
        } finally {
            setUpdatingUser(false);
        }
    };

    const handleDeleteUser = async () => {
        if (!selectedUser) return;

        // Prevent self-deletion
        if (selectedUser.id === user?.id) {
            toast.error("You cannot delete your own account.");
            return;
        }

        if (window.confirm(`Are you sure you want to delete ${selectedUser.full_name}? This action cannot be undone.`)) {
            try {
                setDeletingUser(true);
                await api.delete(`/users/${selectedUser.id}`);
                toast.success('User deleted successfully.');

                // Refresh user list and deselect
                const usersRes = await api.get('/users');
                setUsers(usersRes.data);
                setSelectedUserId('');
                setSelectedUser(null);
                setPermissions({});
                setIsDirty(false);
            } catch (error) {
                const msg = error.response?.data?.message || 'Failed to delete user.';
                toast.error(msg);
            } finally {
                setDeletingUser(false);
            }
        }
    };

    // Mobile: toggle between user list and permissions
    const [mobileView, setMobileView] = useState('users');

    const getInitials = (name) => {
        if (!name) return '?';
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    const getRoleColor = (role) => {
        switch (role) {
            case 'superadmin': return 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800';
            case 'admin': return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800';
            case 'user': return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
            case 'level-2': return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800';
            default: return 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-slate-800 dark:text-gray-300 dark:border-slate-600';
        }
    };

    // Users Management — admin + superadmin
    if (!user?.can_manage_users && user?.role !== 'superadmin' && user?.role !== 'admin') {
        return <Navigate to="/dashboard" replace />;
    }

    return (
        <div className="p-3 sm:p-4 lg:p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-4 lg:mb-6">
                <div className="flex items-center gap-3 mb-2">
                    {location.state?.fromTools && (
                        <button onClick={() => navigate('/analysis-tools')} className="w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex items-center justify-center text-gray-500 hover:text-indigo-600 hover:border-indigo-400 transition-colors shrink-0">
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                    )}
                    <div className="p-2 bg-indigo-50 dark:bg-indigo-950 rounded-lg">
                        <ShieldCheck className="text-indigo-600" size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Access Management</h1>
                        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Assign page and feature-level permissions to officers</p>
                    </div>
                </div>
            </div>

            {/* Mobile View Toggle */}
            <div className="flex lg:hidden gap-2 mb-3">
                <button onClick={() => setMobileView('users')} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${mobileView === 'users' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-gray-400'}`}>Officers</button>
                <button onClick={() => setMobileView('permissions')} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${mobileView === 'permissions' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-gray-400'}`}>Permissions</button>
            </div>

            {/* Main Content - Side by Side on desktop, stacked on mobile */}
            <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 lg:h-[calc(100vh-12rem)] lg:min-h-[600px]">
                {/* Left Panel - User Selection */}
                <div className={`w-full lg:w-80 lg:flex-shrink-0 ${mobileView !== 'users' ? 'hidden lg:block' : ''}`}>
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm h-full flex flex-col">
                        {/* Panel Header */}
                        <div className="p-4 border-b border-gray-200 dark:border-slate-700">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                    <Users size={18} className="text-gray-400 dark:text-gray-500" />
                                    Officers
                                </h2>
                                <button
                                    onClick={() => setShowCreateModal(true)}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors text-sm font-medium"
                                >
                                    <Plus size={16} />
                                    New
                                </button>
                            </div>

                            {/* Search/Select */}
                            <div className="relative">
                                <select
                                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 appearance-none cursor-pointer"
                                    value={selectedUserId}
                                    onChange={handleUserChange}
                                >
                                    <option value="">Select an officer...</option>
                                    {users.map(u => (
                                        <option key={u.id} value={u.id}>
                                            {u.full_name} ({u.role})
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                            </div>
                        </div>

                        {/* Selected User Card */}
                        {selectedUser && (
                            <div className="p-4 border-b border-gray-200 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-800/50">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-semibold text-sm flex-shrink-0">
                                        {getInitials(selectedUser.full_name)}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="font-medium text-gray-900 dark:text-white truncate">{selectedUser.full_name}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{selectedUser.email}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 mt-3">
                                    <span className={`px-2 py-1 text-xs font-medium rounded-md border ${getRoleColor(selectedUser.role)}`}>
                                        {selectedUser.role === 'superadmin' && <Crown size={12} className="inline mr-1" />}
                                        {selectedUser.role.toUpperCase()}
                                    </span>
                                    {hasCustomPermissions && (
                                        <span className="px-2 py-1 text-xs font-medium rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                                            Custom
                                        </span>
                                    )}
                                </div>

                                {/* Edit/Delete Actions */}
                                <div className="flex gap-2 mt-4 pt-4 border-t border-gray-200/60 dark:border-slate-700/60">
                                    <button
                                        onClick={handleEditUserClick}
                                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 rounded-md text-xs font-medium hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                                    >
                                        <Edit2 size={14} />
                                        Edit Details
                                    </button>
                                    {selectedUser.role !== 'superadmin' && (
                                        <button
                                            onClick={handleDeleteUser}
                                            disabled={deletingUser}
                                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-md text-xs font-medium hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <Trash2 size={14} />
                                            {deletingUser ? 'Deleting...' : 'Delete Officer'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Users List */}
                        <div className="flex-1 overflow-y-auto p-2 max-h-[40vh] lg:max-h-none">
                            {loadingUsers ? (
                                <div className="flex items-center justify-center h-32">
                                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-indigo-500 border-t-transparent"></div>
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    {users.map(u => (
                                        <button
                                            key={u.id}
                                            onClick={() => { handleUserChange({ target: { value: u.id } }); setMobileView('permissions'); }}
                                            className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${selectedUserId === u.id
                                                ? 'bg-indigo-50 border-indigo-200 shadow-sm dark:bg-indigo-950 dark:border-indigo-800'
                                                : 'hover:bg-gray-50 border-transparent dark:hover:bg-slate-800'
                                                } border`}
                                        >
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${selectedUserId === u.id
                                                ? 'bg-indigo-200 text-indigo-700 dark:bg-indigo-800 dark:text-indigo-300'
                                                : 'bg-gray-200 text-gray-600 dark:bg-slate-700 dark:text-gray-400'
                                                }`}>
                                                {getInitials(u.full_name)}
                                            </div>
                                            <div className="flex-1 text-left min-w-0">
                                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{u.full_name}</p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{u.email}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Panel - Permissions */}
                <div className={`flex-1 ${mobileView !== 'permissions' ? 'hidden lg:block' : ''}`}>
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm h-full flex flex-col">
                        {/* Panel Header */}
                        <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <h2 className="font-semibold text-gray-700 dark:text-gray-300">Module Permissions</h2>
                                {selectedUser && selectedUser.role !== 'superadmin' && (
                                    <span className="text-sm text-gray-500">
                                        {Object.values(permissions).filter(p => p.enabled).length} / {pages.filter(p => p.path !== '/access-management').length} enabled
                                    </span>
                                )}
                            </div>

                            {selectedUser && selectedUser.role !== 'superadmin' && (
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={selectAll}
                                        className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                        disabled={loadingPerms}
                                    >
                                        Select All
                                    </button>
                                    <button
                                        onClick={deselectAll}
                                        className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                        disabled={loadingPerms}
                                    >
                                        Clear
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 overflow-hidden">
                            {!selectedUserId ? (
                                <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                                    <div className="w-16 h-16 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                                        <Users size={28} className="text-gray-400 dark:text-gray-500" />
                                    </div>
                                    <h3 className="text-gray-700 dark:text-gray-300 font-medium mb-1">No Officer Selected</h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">Choose an officer from the left panel to manage their permissions</p>
                                </div>
                            ) : selectedUser?.role === 'superadmin' ? (
                                <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                                    <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-4">
                                        <Crown size={28} className="text-purple-600" />
                                    </div>
                                    <h3 className="text-gray-700 dark:text-gray-300 font-medium mb-1">Super Admin Access</h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">Super admins have unrestricted access to all modules and features</p>
                                </div>
                            ) : loadingPerms ? (
                                <div className="h-full flex items-center justify-center">
                                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-500 border-t-transparent"></div>
                                </div>
                            ) : (
                                <div className="h-full flex flex-col">
                                    {/* Permissions Table - Scrollable */}
                                    <div className="flex-1 overflow-y-auto p-3 sm:p-4">
                                        <div className="space-y-2">
                                            {pages
                                                .filter(page => page.path !== '/access-management')
                                                .map(page => {
                                                    const perm = permissions[page.path] || { enabled: false, features: [] };
                                                    const isActive = perm.enabled;
                                                    const hasSubFeatures = page.features && page.features.length > 0;

                                                    return (
                                                        <div
                                                            key={page.path}
                                                            className={`border rounded-lg transition-all ${isActive ? 'border-indigo-200 bg-indigo-50/30 dark:border-indigo-800 dark:bg-indigo-950/30' : 'border-gray-200 dark:border-slate-700'
                                                                }`}
                                                        >
                                                            {/* Page Row */}
                                                            <div className="p-3 flex items-center gap-3">
                                                                <button
                                                                    onClick={() => togglePage(page.path)}
                                                                    className={`w-5 h-5 flex-shrink-0 rounded border flex items-center justify-center transition-colors ${isActive
                                                                        ? 'bg-indigo-600 border-indigo-600 text-white'
                                                                        : 'border-gray-300 hover:border-indigo-400 dark:border-slate-600'
                                                                        }`}
                                                                >
                                                                    {isActive && <Check size={12} />}
                                                                </button>
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2">
                                                                        <span className="font-medium text-gray-900 dark:text-white truncate">{page.name}</span>
                                                                        <span className="text-xs text-gray-400 truncate hidden sm:inline">{page.path}</span>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Features */}
                                                            {hasSubFeatures && isActive && (
                                                                <div className="px-3 pb-3 pl-11 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                                    {page.features.map(feat => {
                                                                        const isFeatSelected = perm.features.includes(feat.id);
                                                                        return (
                                                                            <label
                                                                                key={feat.id}
                                                                                className="flex items-center gap-2 cursor-pointer group"
                                                                            >
                                                                                <button
                                                                                    onClick={() => toggleFeature(page.path, feat.id)}
                                                                                    className={`w-4 h-4 flex-shrink-0 rounded border flex items-center justify-center transition-colors ${isFeatSelected
                                                                                        ? 'bg-indigo-600 border-indigo-600 text-white'
                                                                                        : 'border-gray-300 group-hover:border-indigo-400 dark:border-slate-600'
                                                                                        }`}
                                                                                >
                                                                                    {isFeatSelected && <Check size={10} />}
                                                                                </button>
                                                                                <span className="text-sm text-gray-600 dark:text-gray-400">{feat.label}</span>
                                                                            </label>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                    </div>

                                    {/* Save Bar */}
                                    <div className="p-4 border-t border-gray-200 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-800/50">
                                        <div className="flex items-center justify-end gap-4">
                                            {isDirty && (
                                                <span className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                                    <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
                                                    Unsaved changes
                                                </span>
                                            )}
                                            <button
                                                onClick={handleSave}
                                                disabled={saving || !isDirty}
                                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${saving || !isDirty
                                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-slate-800 dark:text-gray-600'
                                                    : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm hover:shadow'
                                                    }`}
                                            >
                                                <Save size={16} />
                                                {saving ? 'Saving...' : 'Save Permissions'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Create User Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-xl max-w-md w-full shadow-xl animate-in fade-in zoom-in duration-200">
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-indigo-50 dark:bg-indigo-950 rounded-lg">
                                        <UserPlus size={20} className="text-indigo-600 dark:text-indigo-400" />
                                    </div>
                                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Create New Officer</h2>
                                </div>
                                <button
                                    onClick={() => setShowCreateModal(false)}
                                    className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                >
                                    <X size={18} className="text-gray-500 dark:text-gray-400" />
                                </button>
                            </div>

                            <form onSubmit={handleCreateUser} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name</label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                        placeholder="e.g. Inspector John Doe"
                                        value={newUserForm.full_name}
                                        onChange={(e) => setNewUserForm({ ...newUserForm, full_name: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email Address</label>
                                    <input
                                        type="email"
                                        required
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                        placeholder="officer@example.com"
                                        value={newUserForm.email}
                                        onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
                                    <input
                                        type="password"
                                        required
                                        minLength={6}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                        placeholder="Minimum 6 characters"
                                        value={newUserForm.password}
                                        onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
                                    <select
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                        value={newUserForm.role}
                                        onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
                                    >
                                        <option value="user">User</option>
                                        {user?.role === 'superadmin' && (
                                          <option value="admin">Admin</option>
                                        )}
                                        {user?.role === 'superadmin' && (
                                          <option value="superadmin" disabled>Super Admin (seed only)</option>
                                        )}
                                    </select>
                                </div>
                                <div className="flex gap-3 pt-4">
                                    <button
                                        type="button"
                                        onClick={() => setShowCreateModal(false)}
                                        className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={creatingUser}
                                        className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:bg-indigo-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {creatingUser ? (
                                            <>
                                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                                                Creating...
                                            </>
                                        ) : 'Create Officer'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
            {/* Edit User Modal */}
            {
                showEditModal && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white dark:bg-slate-900 rounded-xl max-w-md w-full shadow-xl animate-in fade-in zoom-in duration-200">
                            <div className="p-6">
                                <div className="flex items-center justify-between mb-6">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-indigo-50 dark:bg-indigo-950 rounded-lg">
                                            <Edit2 size={20} className="text-indigo-600 dark:text-indigo-400" />
                                        </div>
                                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Edit Officer</h2>
                                    </div>
                                    <button
                                        onClick={() => setShowEditModal(false)}
                                        className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                    >
                                        <X size={18} className="text-gray-500 dark:text-gray-400" />
                                    </button>
                                </div>

                                <form onSubmit={handleUpdateUser} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name</label>
                                        <input
                                            type="text"
                                            required
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                            value={editUserForm.full_name}
                                            onChange={(e) => setEditUserForm({ ...editUserForm, full_name: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email Address</label>
                                        <input
                                            type="email"
                                            required
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                            value={editUserForm.email}
                                            onChange={(e) => setEditUserForm({ ...editUserForm, email: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New Password (Optional)</label>
                                        <input
                                            type="password"
                                            minLength={6}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                            placeholder="Leave blank to keep current password"
                                            value={editUserForm.password}
                                            onChange={(e) => setEditUserForm({ ...editUserForm, password: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
                                        <select
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                            value={editUserForm.role}
                                            onChange={(e) => setEditUserForm({ ...editUserForm, role: e.target.value })}
                                        >
                                            <option value="user">User</option>
                                            {user?.role === 'superadmin' && (
                                              <option value="admin">Admin</option>
                                            )}
                                            {user?.role === 'superadmin' && (
                                              <option value="superadmin">Super Admin</option>
                                            )}
                                        </select>
                                    </div>
                                    <div className="flex gap-3 pt-4">
                                        <button
                                            type="button"
                                            onClick={() => setShowEditModal(false)}
                                            className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={updatingUser}
                                            className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:bg-indigo-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                        >
                                            {updatingUser ? (
                                                <>
                                                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                                                    Saving...
                                                </>
                                            ) : 'Save Changes'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default AccessManagement;
