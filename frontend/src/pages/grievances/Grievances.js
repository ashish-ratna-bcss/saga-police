import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api, { BACKEND_URL } from '../../lib/api';
import { useAuth } from '../../context/auth.context';
import {
    Search, Shield, FileText, CheckCircle2, Calendar, Clock,
    AlertCircle, X, RefreshCw, Plus, Trash2, Loader2, Download,
    Building2, Users, BadgeCheck, CalendarDays, Filter, ChevronDown, ExternalLink, MessageSquare, Pencil,
    Layers, Activity, Flame, BarChart3
} from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import { Separator } from '../../components/ui/separator';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
    DialogDescription, DialogFooter
} from '../../components/ui/dialog';
import { ScrollArea } from '../../components/ui/scroll-area';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '../../components/ui/select';
import { toast } from 'sonner';
import { cn, getScrollParent } from '../../lib/utils';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { Calendar as CalendarComponent } from '../../components/ui/calendar';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import { format } from 'date-fns';
import { VideoPlayer, normalizeMediaList } from '../../components/AlertCards';
import { GrievanceCard } from '../../components/grievances/GrievanceCard';
import { GrievanceTopNavbar } from '../../components/grievances/GrievanceTopNavbar';
import { CriticismPopup } from '../../components/grievances/CriticismPopup';
import { GrievancePopup } from '../../components/grievances/GrievancePopup';
import { GrievanceStatusChangePopup } from '../../components/grievances/GrievanceStatusChangePopup';
import { SuggestionPopup } from '../../components/grievances/SuggestionPopup';
import { GrievanceService } from '../../api';
import { socialProfilesApi } from '../../api/socialProfiles.api';
import { usePagePlatforms } from '../../hooks/usePagePlatforms';
import { GrievanceExecutiveHeader } from '../../components/grievances/GrievanceExecutiveHeader';
import { GrievanceUnifiedReports } from '../../components/grievances/GrievanceUnifiedReports';

const DEFAULT_SOCIAL_ACTION_OVERLAY = {
    visible: false,
    platformLabel: '',
    instruction: '',
    url: '',
    popupBlocked: false,
    composerOpened: false
};

const isVideoPreviewMedia = (media) => {
    const type = String(media?.type || media?.media_type || '').toLowerCase();
    const mediaUrl = String(media?.video_url || media?.url || '');
    return ['video', 'animated_gif', 'gifv', '2'].includes(type)
        || /\.(mp4|webm|mkv|mov|avi|m3u8)(\?|$)/i.test(mediaUrl);
};

const DetailPopupMediaTile = ({ media, getProxiedMediaUrl, activeVideoRef, className = '', onImageClick }) => {
    const videoRef = useRef(null);
    const [videoFailed, setVideoFailed] = useState(false);

    const isVideo = isVideoPreviewMedia(media);
    const imageSrc = getProxiedMediaUrl(media?.preview_url || media?.preview || media?.url || '');
    const videoSrc = getProxiedMediaUrl(media?.video_url || media?.url || '');

    useEffect(() => {
        const videoElement = videoRef.current;
        if (!videoElement || !isVideo || typeof IntersectionObserver === 'undefined') return undefined;

        const observer = new IntersectionObserver(
            (entries) => {
                const entry = entries?.[0];
                if (!entry?.isIntersecting && !videoElement.paused) {
                    videoElement.pause();
                }
            },
            { root: getScrollParent(videoElement), threshold: 0.15 }
        );

        observer.observe(videoElement);

        return () => {
            observer.disconnect();
            if (activeVideoRef?.current === videoElement) {
                activeVideoRef.current = null;
            }
        };
    }, [activeVideoRef, isVideo, videoSrc]);

    if (!media?.url && !media?.preview_url && !media?.preview && !media?.video_url) return null;

    if (isVideo && !videoFailed) {
        return (
            <div className={cn('rounded overflow-hidden bg-black', className)}>
                <video
                    ref={videoRef}
                    src={videoSrc || imageSrc}
                    poster={imageSrc || undefined}
                    className="w-full h-full object-contain bg-black"
                    controls
                    playsInline
                    preload="none"
                    onPlay={(e) => {
                        const currentVideo = e.currentTarget;
                        if (activeVideoRef?.current && activeVideoRef.current !== currentVideo && !activeVideoRef.current.paused) {
                            activeVideoRef.current.pause();
                        }
                        if (activeVideoRef) {
                            activeVideoRef.current = currentVideo;
                        }
                    }}
                    onPause={(e) => {
                        if (activeVideoRef?.current === e.currentTarget) {
                            activeVideoRef.current = null;
                        }
                    }}
                    onEnded={(e) => {
                        if (activeVideoRef?.current === e.currentTarget) {
                            activeVideoRef.current = null;
                        }
                    }}
                    onError={() => setVideoFailed(true)}
                />
            </div>
        );
    }

    return (
        <button
            type="button"
            className={cn('rounded overflow-hidden bg-slate-100 dark:bg-slate-800', className, onImageClick ? 'cursor-pointer' : 'cursor-default')}
            onClick={onImageClick}
            disabled={!onImageClick}
        >
            <img
                src={imageSrc}
                alt=""
                className="w-full h-full object-contain bg-slate-100 dark:bg-slate-800"
                referrerPolicy="no-referrer"
                onError={(e) => { e.target.style.display = 'none'; }}
            />
        </button>
    );
};

/* ═══════════════════════════════════════════════════════════════ */
/*                       MAIN COMPONENT                          */
/* ═══════════════════════════════════════════════════════════════ */
const Grievances = () => {
    // Get logged-in user from AuthContext (full_name is the canonical field)
    const { user: authUser } = useAuth();
    const userName = authUser?.full_name || authUser?.name || authUser?.email?.split('@')[0] || 'Operator';
    const [downloadStates, setDownloadStates] = useState({});

    const updateDownloadState = useCallback((id, updates) => {
        if (!id) return;
        setDownloadStates((prev) => ({
            ...prev,
            [id]: {
                ...(prev[id] || {}),
                ...updates
            }
        }));
    }, []);

    const getProxiedMediaUrl = useCallback((rawUrl) => rawUrl || '', []);

    const toPreviewMedia = useCallback((mediaItem) => {
        if (!mediaItem) return null;

        const normalized = normalizeMediaList([mediaItem])[0];
        if (normalized) {
            return {
                ...mediaItem,
                type: normalized.type,
                url: normalized.url,
                video_url: normalized.type === 'video' ? normalized.url : (mediaItem.video_url || ''),
                preview_url: normalized.preview || normalized.url,
                preview: normalized.preview || normalized.url,
                fallbackUrls: normalized.fallbackUrls || [],
                previewFallbackUrls: normalized.previewFallbackUrls || []
            };
        }

        const url = mediaItem.url || mediaItem.video_url || mediaItem.preview_url || mediaItem.preview || '';
        const preview = mediaItem.preview_url || mediaItem.preview || mediaItem.thumbnail_url || mediaItem.image_url || url;
        const typeHint = String(mediaItem.type || mediaItem.media_type || '').toLowerCase();
        const isVideo =
            ['video', 'animated_gif', 'gifv', '2'].includes(typeHint)
            || /\.(mp4|webm|mkv|mov|avi|m3u8)(\?|$)/i.test(String(url));

        return {
            ...mediaItem,
            type: isVideo ? 'video' : 'photo',
            url,
            video_url: mediaItem.video_url || (isVideo ? url : ''),
            preview_url: preview,
            preview
        };
    }, []);

    const triggerBlobDownload = useCallback(async (url, filename) => {
        try {
            const absoluteUrl = typeof url === 'string' && url.startsWith('/') ? `${BACKEND_URL}${url}` : url;
            const response = await fetch(absoluteUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const contentType = (response.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('text/html')) {
                throw new Error('Invalid file response (HTML)');
            }
            const blob = await response.blob();
            const hasExtension = /\.[a-z0-9]{2,5}$/i.test(filename || '');
            let finalFilename = filename || 'media';
            if (!hasExtension) {
                if (contentType.includes('video/mp4')) finalFilename = `${finalFilename}.mp4`;
                else if (contentType.includes('video/')) finalFilename = `${finalFilename}.mp4`;
                else if (contentType.includes('image/png')) finalFilename = `${finalFilename}.png`;
                else if (contentType.includes('image/webp')) finalFilename = `${finalFilename}.webp`;
                else if (contentType.includes('image/gif')) finalFilename = `${finalFilename}.gif`;
                else finalFilename = `${finalFilename}.jpg`;
            }
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = finalFilename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
            return true;
        } catch (error) {
            return false;
        }
    }, []);

    const downloadMediaForGrievance = async (grievance) => {
        const grievanceId = grievance?.id;
        const context = grievance?.context || {};

        const collectedMedia = [
            ...normalizeMediaList(grievance?.content?.media),
            ...normalizeMediaList(context?.content?.media),
            ...normalizeMediaList(context?.quoted?.content?.media),
            ...normalizeMediaList(context?.in_reply_to?.content?.media),
            ...normalizeMediaList(context?.reposted_from?.content?.media),
            ...normalizeMediaList(context?.parent?.content?.media),
            ...normalizeMediaList(context?.thread_parent?.content?.media)
        ];

        const mediaItems = Array.from(new Map(
            collectedMedia
                .map((item) => ({
                    type: item?.type || 'photo',
                    url: item?.url || item?.preview
                }))
                .filter((item) => !!item.url)
                .map((item) => [item.url, item])
        ).values());

        const fallbackMediaUrl = [
            grievance?.tweet_url,
            grievance?.url,
            context?.tweet_url,
            context?.url,
            context?.quoted?.tweet_url,
            context?.quoted?.url,
            context?.in_reply_to?.tweet_url,
            context?.in_reply_to?.url,
            context?.reposted_from?.tweet_url,
            context?.reposted_from?.url,
            context?.parent?.tweet_url,
            context?.parent?.url,
            context?.thread_parent?.tweet_url,
            context?.thread_parent?.url,
            mediaItems[0]?.url
        ].find(Boolean);

        if (!mediaItems.length && !fallbackMediaUrl) {
            updateDownloadState(grievanceId, { error: 'No media available to download' });
            setTimeout(() => updateDownloadState(grievanceId, { error: null }), 3000);
            toast.error('No media available to download');
            return;
        }

        const isVideoLike = (item) => {
            const type = String(item?.type || '').toLowerCase();
            const url = String(item?.url || '').toLowerCase();
            return type === 'video' || type === 'animated_gif' || url.includes('video.twimg.com') || /\.(mp4|webm|mov|mkv|avi|m3u8)(\?|$)/i.test(url);
        };

        const videoItems = mediaItems.filter(isVideoLike);
        const imageItems = mediaItems.filter((item) => !isVideoLike(item));

        updateDownloadState(grievanceId, {
            downloading: true,
            progress: 5,
            status: 'Video is downloading...',
            error: null
        });

        let progress = 5;
        const progressInterval = setInterval(() => {
            progress = Math.min(progress + Math.random() * 12, 90);
            updateDownloadState(grievanceId, {
                progress,
                status: progress < 45 ? 'Fetching media info...' : progress < 75 ? 'Downloading video...' : 'Finalizing download...'
            });
        }, 450);

        try {
            const filesToDownload = [];

            if (videoItems.length > 0) {
                const uniqueVideoUrls = [...new Set(videoItems.map((v) => v.url).filter(Boolean))];
                updateDownloadState(grievanceId, { progress: 20, status: `Preparing ${uniqueVideoUrls.length} video download(s)...` });

                for (let vi = 0; vi < uniqueVideoUrls.length; vi += 1) {
                    const videoUrl = uniqueVideoUrls[vi];
                    const baseProgress = 20 + Math.round(((vi + 1) / uniqueVideoUrls.length) * 20);
                    updateDownloadState(grievanceId, { progress: baseProgress, status: `Fetching video ${vi + 1}/${uniqueVideoUrls.length}...` });

                    const videoResponse = await api.post('/media/download-video', {
                        media_url: videoUrl || fallbackMediaUrl,
                        content_id: grievance?.content_id || grievance?.id
                    });

                    const vData = videoResponse.data || {};
                    if (Array.isArray(vData.items) && vData.items.length > 0) {
                        filesToDownload.push(...vData.items.map((item, idx) => ({
                            url: item?.download_url,
                            filename: item?.filename || `video_${vi + 1}_${idx + 1}.mp4`
                        })));
                    } else if (vData.download_url) {
                        filesToDownload.push({
                            url: vData.download_url,
                            filename: vData.filename || `video_${vi + 1}.mp4`
                        });
                    }
                }
            }

            if (imageItems.length > 0) {
                updateDownloadState(grievanceId, { progress: 45, status: 'Preparing image download...' });
                const imageUrls = imageItems.map((m) => m.url).filter(Boolean);
                const imageResponse = await api.post('/media/download-images', {
                    image_urls: imageUrls,
                    content_id: grievance?.content_id || grievance?.id
                });
                const iData = imageResponse.data || {};
                if (Array.isArray(iData.items) && iData.items.length > 0) {
                    filesToDownload.push(...iData.items.map((item, idx) => ({
                        url: item?.download_url,
                        filename: item?.filename || `image_${idx + 1}.jpg`
                    })));
                }
            }

            if (!filesToDownload.length) {
                clearInterval(progressInterval);
                updateDownloadState(grievanceId, {
                    downloading: false,
                    progress: 0,
                    status: '',
                    error: 'No download URL returned from server'
                });
                setTimeout(() => updateDownloadState(grievanceId, { error: null }), 3000);
                toast.error('No download URL returned from server');
                return;
            }

            clearInterval(progressInterval);
            updateDownloadState(grievanceId, { progress: 92, status: 'Saving files...' });

            let successCount = 0;
            for (let i = 0; i < filesToDownload.length; i += 1) {
                const item = filesToDownload[i];
                const ok = await triggerBlobDownload(item.url, item.filename);
                if (ok) successCount += 1;

                const pct = 92 + Math.round(((i + 1) / filesToDownload.length) * 8);
                updateDownloadState(grievanceId, { progress: Math.min(100, pct), status: 'Download started' });
                if (i < filesToDownload.length - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 300));
                }
            }

            if (successCount === 0) {
                throw new Error('All downloads failed');
            }

            setTimeout(() => {
                updateDownloadState(grievanceId, {
                    downloading: false,
                    progress: 0,
                    status: ''
                });
            }, 900);

            toast.success(`Downloaded ${successCount} file${successCount !== 1 ? 's' : ''}`);
        } catch (error) {
            clearInterval(progressInterval);
            updateDownloadState(grievanceId, {
                downloading: false,
                progress: 0,
                status: '',
                error: error?.response?.data?.error || 'Failed to download media'
            });
            setTimeout(() => updateDownloadState(grievanceId, { error: null }), 3000);
            toast.error(error?.response?.data?.error || 'Failed to download media');
        }
    };

    /* ─── State ─── */
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [grievances, setGrievances] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [activeTab, setActiveTab] = useState('all');
    const [stats, setStats] = useState({ total: 0, pending: 0, escalated: 0, closed: 0, converted_to_fir: 0 });
    const [workflowStats, setWorkflowStats] = useState({ total: 0, pending: 0, escalated: 0, closed: 0, fir: 0 });
    const [reportTypeCounts, setReportTypeCounts] = useState({
        grievance: null,
        suggestion: null,
        criticism: null,
    });
    const [pagination, setPagination] = useState({ hasMore: false, nextCursor: null, total: 0 });
    const grievanceSentinelRef = useRef(null);
    const grievanceLoadMoreRef = useRef(() => {});
    const loadingMoreRef = useRef(false);

    // Sources
    const [sources, setSources] = useState([]);
    const [sourcesLoading, setSourcesLoading] = useState(false);
    const [showAddSource, setShowAddSource] = useState(false);
    const [addSourceHandle, setAddSourceHandle] = useState('');
    const [addSourceDept, setAddSourceDept] = useState('');
    const [addingSource, setAddingSource] = useState(false);
    const [fetchingSource, setFetchingSource] = useState(null);
    // Fetch date range for source
    const [fetchDateDialog, setFetchDateDialog] = useState(null);
    const [fetchDateRange, setFetchDateRange] = useState({ from: null, to: null });

    // Dialogs
    const [isStatusOpen, setIsStatusOpen] = useState(false);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [isMediaOpen, setIsMediaOpen] = useState(false);
    const [isFirConfirmOpen, setIsFirConfirmOpen] = useState(false);
    const [deleteConfirmSource, setDeleteConfirmSource] = useState(null);

    // Criticism popup
    const [criticismGrievance, setCriticismGrievance] = useState(null);
    const [grievancePopupGrievance, setGrievancePopupGrievance] = useState(null);
    const [statusChangePopup, setStatusChangePopup] = useState(null); // { grievance, targetStatus }
    const [suggestionPopupGrievance, setSuggestionPopupGrievance] = useState(null);

    // Selected grievance
    const [selectedGrievance, setSelectedGrievance] = useState(null);
    const activeDetailVideoRef = useRef(null);
    const socialPopupWatcherRef = useRef(null);
    const socialPopupWindowRef = useRef(null);
    const [socialActionOverlay, setSocialActionOverlay] = useState(DEFAULT_SOCIAL_ACTION_OVERLAY);
    const [selectedMedia, setSelectedMedia] = useState(null);

    // Reply comment internal dialog
    const [replyCommentDialog, setReplyCommentDialog] = useState({ open: false, grievance: null, message: '', submitting: false });
    const selectedPreviewMedia = useMemo(() => toPreviewMedia(selectedMedia), [selectedMedia, toPreviewMedia]);
    const selectedMediaIsVideo = useMemo(() => {
        const type = String(selectedPreviewMedia?.type || '').toLowerCase();
        const mediaUrl = String(selectedPreviewMedia?.video_url || selectedPreviewMedia?.url || '');
        return ['video', 'animated_gif', 'gifv', '2'].includes(type)
            || /\.(mp4|webm|mkv|mov|avi|m3u8)(\?|$)/i.test(mediaUrl);
    }, [selectedPreviewMedia]);
    const [newStatus, setNewStatus] = useState('');
    const [statusUpdateNote, setStatusUpdateNote] = useState('');
    const [firNote, setFirNote] = useState('');
    const [firNumber, setFirNumber] = useState('');
    const [updatingStatus, setUpdatingStatus] = useState(false);

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [platformFilter, setPlatformFilter] = useState('all');
    const [dateRange, setDateRange] = useState({ from: null, to: null });
    const { platforms: grievancePlatformRows, slugs: grievancePlatforms, loading: grievancePlatformsLoading } = usePagePlatforms('grievances');

    // Top Navbar Filters
    const [navbarPlatform, setNavbarPlatform] = useState('all');
    const [navbarStatus, setNavbarStatus] = useState('total');

    const grievanceStatusFeatureMap = useMemo(() => ({
        total: 'all ',
        pending: 'pending',
        escalated: 'pending',
        closed: 'closed',
        fir: 'fir',
        reports: 'reports',
    }), []);

    const canAccessGrievanceReports = true;

    const allowedNavbarStatuses = useMemo(
        () => Object.keys(grievanceStatusFeatureMap),
        [grievanceStatusFeatureMap]
    );

    // Enforce feature access on navbarStatus.
    useEffect(() => {
        if (allowedNavbarStatuses.length === 0) {
            setNavbarStatus('');
            return;
        }
        if (!allowedNavbarStatuses.includes(navbarStatus)) {
            setNavbarStatus(allowedNavbarStatuses[0]);
        }
    }, [allowedNavbarStatuses, navbarStatus]);

    useEffect(() => {
        const rawTab = (searchParams.get('tab') || searchParams.get('status') || '').toLowerCase();
        const rawPlatform = (searchParams.get('platform') || '').toLowerCase();

        const normalizedTab = rawTab === 'total' ? 'all' : rawTab;
        const validTabs = ['all', 'pending', 'escalated', 'closed', 'fir', 'criticism', 'suggestion', 'reports'];
        if (normalizedTab && validTabs.includes(normalizedTab)) {
            if (normalizedTab === 'reports') {
                setNavbarStatus('reports');
            } else {
                setNavbarStatus(normalizedTab === 'all' ? 'total' : normalizedTab);
                setActiveTab(normalizedTab);
            }
        } else if (!rawTab) {
            setNavbarStatus('total');
            setActiveTab('all');
        }

        const normalizedPlatform = rawPlatform === 'twitter' ? 'x' : rawPlatform;
        const validPlatforms = ['all', ...grievancePlatforms];
        if (grievancePlatformsLoading) return;
        if (normalizedPlatform && validPlatforms.includes(normalizedPlatform)) {
            setNavbarPlatform(normalizedPlatform);
            setPlatformFilter(normalizedPlatform);
        } else if (!rawPlatform) {
            setNavbarPlatform('all');
            setPlatformFilter('all');
        } else {
            setNavbarPlatform('all');
            setPlatformFilter('all');
        }
    }, [searchParams, grievancePlatforms, grievancePlatformsLoading]);

    // Keep tab and top navbar status aligned so payload filters match what user selected.
    useEffect(() => {
        if (!navbarStatus || navbarStatus === 'reports') return;
        const targetTab = navbarStatus === 'total' ? 'all' : navbarStatus;
        setActiveTab(targetTab);
    }, [navbarStatus]);

    const [selectedHandle, setSelectedHandle] = useState(null);
    const [openGReportCode, setOpenGReportCode] = useState('');
    const [openSReportCode, setOpenSReportCode] = useState('');
    const [openCReportCode, setOpenCReportCode] = useState('');
    const [actionedGrievanceIds, setActionedGrievanceIds] = useState([]);

    // Debounce search
    const searchTimerRef = useRef(null);
    const [debouncedSearch, setDebouncedSearch] = useState('');

    const grievancesRequestSeqRef = useRef(0);

    // Excel sheet modal
    const [showExcelModal, setShowExcelModal] = useState(false);
    const [preFilledRow, setPreFilledRow] = useState(null); // For pre-filling from grievance
    const [excelRows, setExcelRows] = useState([
        {
            id: 1,
            uniqueNumber: 'UNQ-001',
            callerNumber: '',
            receivedBy: userName,
            mentionName: '',
            receivedTime: new Date().toISOString().slice(0, 16),
            contents: '',
            psJurisdiction: '',
            typeOfPost: '',
            subCategory: '',
            informedTo: '',
            actionTime: '',
            actionTaken: '',
            caseDetails: '',
            actionInformedTo: '',
            completionDate: '',
        }
    ]);

    // Draggable/resizable modal state
    const [modalPos, setModalPos] = useState({ x: 100, y: 50 });
    const [modalSize, setModalSize] = useState({ width: 1200, height: 600 });
    const [isDraggingModal, setIsDraggingModal] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [isResizingModal, setIsResizingModal] = useState(false);
    const modalRef = useRef(null);

    useEffect(() => {
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        searchTimerRef.current = setTimeout(() => {
            setDebouncedSearch(searchQuery);
        }, 400);
        return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
    }, [searchQuery]);

    // Modal dragging
    useEffect(() => {
        if (!isDraggingModal) return;

        const handleMouseMove = (e) => {
            setModalPos({
                x: e.clientX - dragOffset.x,
                y: e.clientY - dragOffset.y,
            });
        };

        const handleMouseUp = () => setIsDraggingModal(false);

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDraggingModal, dragOffset]);

    // Modal resizing
    useEffect(() => {
        if (!isResizingModal) return;

        const handleMouseMove = (e) => {
            if (!modalRef.current) return;
            const rect = modalRef.current.getBoundingClientRect();
            const newWidth = Math.max(600, e.clientX - rect.left);
            const newHeight = Math.max(400, e.clientY - rect.top);
            setModalSize({ width: newWidth, height: newHeight });
        };

        const handleMouseUp = () => setIsResizingModal(false);

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizingModal]);

    useEffect(() => {
        if (isDetailOpen) return;
        if (activeDetailVideoRef.current && !activeDetailVideoRef.current.paused) {
            activeDetailVideoRef.current.pause();
        }
        activeDetailVideoRef.current = null;
    }, [isDetailOpen]);

    const clearSocialPopupWatcher = useCallback(() => {
        if (socialPopupWatcherRef.current) {
            window.clearInterval(socialPopupWatcherRef.current);
            socialPopupWatcherRef.current = null;
        }
    }, []);

    const handleCloseSocialActionOverlay = useCallback((confirmCompletion = true, platformLabelOverride = '') => {
        clearSocialPopupWatcher();

        const popupWindow = socialPopupWindowRef.current;
        if (popupWindow && !popupWindow.closed) {
            try {
                popupWindow.close();
            } catch {
                // ignore close errors
            }
        }
        socialPopupWindowRef.current = null;

        const platformLabel = platformLabelOverride || socialActionOverlay.platformLabel || 'social media';
        setSocialActionOverlay(DEFAULT_SOCIAL_ACTION_OVERLAY);

        if (!confirmCompletion) return;

        window.focus();
        const completed = window.confirm(`Did you complete the ${platformLabel} action?`);
        if (completed) {
            toast.success('Great! Task completed ✅');
        } else {
            toast.info('Please try again 🔁');
        }
    }, [clearSocialPopupWatcher, socialActionOverlay.platformLabel]);

    const openSocialComposerWindow = useCallback((url, platformLabel) => {
        if (!url) return false;

        const popupName = `grievance-social-popup-${String(platformLabel || 'social').replace(/\s+/g, '-').toLowerCase()}`;
        const width = 620;
        const height = 700;
        const left = Math.max(0, window.screenX + Math.round((window.outerWidth - width) / 2));
        const top = Math.max(0, window.screenY + Math.round((window.outerHeight - height) / 2));
        const popupFeatures = [
            'popup=yes',
            `width=${width}`,
            `height=${height}`,
            `left=${left}`,
            `top=${top}`,
            'resizable=yes',
            'scrollbars=yes',
            'status=no',
            'toolbar=no',
            'menubar=no',
            'location=no'
        ].join(',');

        const popupWindow = window.open(url, popupName, popupFeatures);
        if (!popupWindow) {
            setSocialActionOverlay((prev) => (
                prev.visible
                    ? {
                        ...prev,
                        popupBlocked: true,
                        composerOpened: false
                    }
                    : prev
            ));
            return false;
        }

        try {
            popupWindow.focus();
        } catch {
            // ignore focus errors
        }

        socialPopupWindowRef.current = popupWindow;
        setSocialActionOverlay((prev) => (
            prev.visible
                ? {
                    ...prev,
                    popupBlocked: false,
                    composerOpened: true
                }
                : prev
        ));

        clearSocialPopupWatcher();
        socialPopupWatcherRef.current = window.setInterval(() => {
            if (!popupWindow || popupWindow.closed) {
                handleCloseSocialActionOverlay(true, platformLabel);
            }
        }, 500);

        return true;
    }, [clearSocialPopupWatcher, handleCloseSocialActionOverlay]);

    const handleOpenSocialActionInNewTab = useCallback(() => {
        if (!socialActionOverlay.url) {
            toast.error('Unable to open social composer link.');
            return;
        }

        const openedPopup = openSocialComposerWindow(
            socialActionOverlay.url,
            socialActionOverlay.platformLabel
        );

        if (!openedPopup) {
            toast.error('Popup blocked. Allow popups for this site and try again.');
        }
    }, [openSocialComposerWindow, socialActionOverlay.platformLabel, socialActionOverlay.url]);

    useEffect(() => () => {
        clearSocialPopupWatcher();
        const popupWindow = socialPopupWindowRef.current;
        if (popupWindow && !popupWindow.closed) {
            try {
                popupWindow.close();
            } catch {
                // ignore close errors
            }
        }
        socialPopupWindowRef.current = null;
    }, [clearSocialPopupWatcher]);

    const extractTwitterStatusId = useCallback((grievance) => {
        const idCandidates = [
            grievance?.tweet_id,
            grievance?.content_id,
            grievance?.context?.in_reply_to?.tweet_id,
            grievance?.context?.thread_parent?.tweet_id,
            grievance?.context?.parent?.tweet_id
        ]
            .map((value) => String(value || '').trim())
            .filter(Boolean);

        const directStatusId = idCandidates.find((value) => /^\d{6,}$/.test(value));
        if (directStatusId) return directStatusId;

        const embeddedStatusId = idCandidates
            .map((value) => value.match(/(\d{6,})/)?.[1] || '')
            .find(Boolean);
        if (embeddedStatusId) return embeddedStatusId;

        const urlCandidates = [
            grievance?.tweet_url,
            grievance?.url,
            grievance?.post_url,
            grievance?.context?.in_reply_to?.tweet_url,
            grievance?.context?.in_reply_to?.url,
            grievance?.context?.thread_parent?.tweet_url,
            grievance?.context?.thread_parent?.url,
            grievance?.context?.parent?.tweet_url,
            grievance?.context?.parent?.url
        ]
            .map((value) => String(value || '').trim())
            .filter(Boolean);

        for (const candidateUrl of urlCandidates) {
            const match = candidateUrl.match(/status\/(\d+)/i);
            if (match?.[1]) return match[1];
        }

        return '';
    }, []);

    const buildSocialPopupConfig = useCallback((grievance) => {
        const platform = String(grievance?.platform || '').toLowerCase();

        if (platform === 'x' || platform === 'twitter') {
            const tweetId = extractTwitterStatusId(grievance);
            const accountHandle = String(grievance?.posted_by?.handle || '').replace(/^@/, '').trim();
            const params = new URLSearchParams();
            if (tweetId) params.set('in_reply_to', tweetId);
            if (accountHandle) params.set('text', `@${accountHandle} `);

            return {
                platformLabel: 'X (Twitter)',
                url: `https://twitter.com/intent/tweet${params.toString() ? `?${params.toString()}` : ''}`,
                instruction: 'We opened an X (Twitter) popup. Please complete your reply/comment and close it.'
            };
        }

        if (platform === 'facebook') {
            const postUrl = grievance?.url || grievance?.tweet_url || grievance?.post_url || grievance?.context?.in_reply_to?.url || grievance?.context?.in_reply_to?.tweet_url;
            if (!postUrl) return null;

            return {
                platformLabel: 'Facebook',
                url: postUrl,
                instruction: 'We opened the Facebook post. Please comment directly on the post and close the popup when done.'
            };
        }

        if (platform === 'instagram') {
            const postUrl = grievance?.url || grievance?.tweet_url || grievance?.post_url || grievance?.context?.in_reply_to?.url || grievance?.context?.in_reply_to?.tweet_url;
            if (!postUrl) return null;

            return {
                platformLabel: 'Instagram',
                url: postUrl,
                instruction: 'We opened the Instagram post. Please comment directly on the post and close the popup when done.'
            };
        }

        return null;
    }, [extractTwitterStatusId]);

    const handleReplyCommentAction = useCallback((grievance) => {
        if (!grievance || socialActionOverlay.visible) return;

        const popupConfig = buildSocialPopupConfig(grievance);
        if (!popupConfig?.url) {
            toast.error('Reply / Comment is available for X, Facebook, and Instagram posts.');
            return;
        }

        setSocialActionOverlay({
            visible: true,
            platformLabel: popupConfig.platformLabel,
            url: popupConfig.url,
            instruction: popupConfig.instruction,
            popupBlocked: false,
            composerOpened: false
        });

        const opened = openSocialComposerWindow(popupConfig.url, popupConfig.platformLabel);
        if (!opened) {
            toast.error('Popup blocked. Use Open Popup Window to continue.');
        }
    }, [buildSocialPopupConfig, openSocialComposerWindow, socialActionOverlay.visible]);

    /* ─── Reply Comment Submit: save comm log → open X reply ─── */
    const handleReplyCommentSubmit = useCallback(async () => {
        const { grievance, message } = replyCommentDialog;
        if (!grievance || !message.trim()) {
            toast.error('Please write a message before submitting.');
            return;
        }

        setReplyCommentDialog(prev => ({ ...prev, submitting: true }));

        // 1) Save to communication log if a workflow report exists
        const reportId = grievance.grievance_workflow?.report_id;
        if (reportId) {
            try {
                const platform = String(grievance.platform || 'x').toLowerCase();
                const mode =
                  platform === 'facebook'
                    ? 'FB POST'
                    : platform === 'instagram'
                      ? 'IG POST'
                      : 'X POST';
                await api.post(`/grievance-workflow/reports/${reportId}/communication-log`, {
                    content: `Operator(${userName}) → User: ${message.trim()}`,
                    mode
                });
                toast.success('Communication log saved');
            } catch (err) {
                console.error('Failed to save communication log:', err);
                toast.error('Failed to save communication log, but continuing to reply...');
            }
        }

        // 2) Build the X/Facebook reply URL with the message pre-filled
        const platform = String(grievance.platform || '').toLowerCase();
        if (platform === 'x' || platform === 'twitter') {
            const tweetId = extractTwitterStatusId(grievance);
            const accountHandle = String(grievance.posted_by?.handle || '').replace(/^@/, '').trim();
            const params = new URLSearchParams();
            if (tweetId) params.set('in_reply_to', tweetId);
            const replyText = accountHandle ? `@${accountHandle} ${message.trim()}` : message.trim();
            params.set('text', replyText);
            const url = `https://twitter.com/intent/tweet?${params.toString()}`;

            setSocialActionOverlay({
                visible: true,
                platformLabel: 'X (Twitter)',
                url,
                instruction: 'We opened an X (Twitter) popup with your message pre-filled. Please review and click Tweet to submit.',
                popupBlocked: false,
                composerOpened: false
            });

            const opened = openSocialComposerWindow(url, 'X (Twitter)');
            if (!opened) {
                toast.error('Popup blocked. Use Open Popup Window to continue.');
            }
        } else if (platform === 'facebook') {
            const postUrl = grievance?.url || grievance?.tweet_url || grievance?.post_url;
            if (postUrl) {
                setSocialActionOverlay({
                    visible: true,
                    platformLabel: 'Facebook',
                    url: postUrl,
                    instruction: 'We opened the Facebook post. Please paste your message as a comment and submit.',
                    popupBlocked: false,
                    composerOpened: false
                });

                const opened = openSocialComposerWindow(postUrl, 'Facebook');
                if (!opened) {
                    toast.error('Popup blocked. Use Open Popup Window to continue.');
                }
            }
        }

        setReplyCommentDialog({ open: false, grievance: null, message: '', submitting: false });
    }, [replyCommentDialog, userName, extractTwitterStatusId, openSocialComposerWindow]);

    /* ─── Data Fetching ─── */
    const canAccessGrievanceReportsRef = useRef(canAccessGrievanceReports);
    canAccessGrievanceReportsRef.current = canAccessGrievanceReports;

    const fetchSources = async () => {
        setSourcesLoading(true);
        try {
            const res = await GrievanceService.listSources();
            const rows = Array.isArray(res.data) ? res.data : [];
            setSources(rows.filter((source) => {
                const p = String(source?.platform || '').toLowerCase();
                return (
                  p === 'x' ||
                  p === 'twitter' ||
                  p === 'facebook' ||
                  p === 'instagram'
                );
            }));
        } catch (error) {
            console.error('Failed to fetch sources', error);
        } finally {
            setSourcesLoading(false);
        }
    };

    const fetchDashboardStats = useCallback(async () => {
        try {
            const effectivePlatform = navbarPlatform && navbarPlatform !== 'all'
                ? navbarPlatform
                : (platformFilter && platformFilter !== 'all' ? platformFilter : undefined);
            const platformParam = effectivePlatform ? { platform: effectivePlatform } : {};

            const requests = [GrievanceService.getStats(platformParam)];
            if (canAccessGrievanceReportsRef.current) {
                requests.push(api.get('/grievance-workflow/reports', {
                    params: {
                        page: 1,
                        limit: 1,
                        ...platformParam
                    }
                }));
            }

            const [statsRes, wfRes] = await Promise.all(requests);
            if (statsRes.data) setStats(statsRes.data);
            if (wfRes?.data?.stats) {
                setWorkflowStats(wfRes.data.stats);
            } else if (!canAccessGrievanceReportsRef.current) {
                setWorkflowStats({ total: 0, pending: 0, escalated: 0, closed: 0, fir: 0 });
            }
        } catch (error) {
            console.error('Failed to fetch stats', error);
        }
    }, [navbarPlatform, platformFilter]);

    const fetchGrievances = useCallback(async (cursor = null) => {
        if (!navbarStatus || (allowedNavbarStatuses.length > 0 && !allowedNavbarStatuses.includes(navbarStatus))) {
            setGrievances([]);
            setPagination({ hasMore: false, nextCursor: null, total: 0 });
            setLoading(false);
            setLoadingMore(false);
            return;
        }

        if (navbarStatus === 'reports') {
            setGrievances([]);
            setPagination({ hasMore: false, nextCursor: null, total: 0 });
            setLoading(false);
            setLoadingMore(false);
            return;
        }

        if (cursor) {
            setLoadingMore(true);
        } else {
            setLoading(true);
        }
        const requestSeq = ++grievancesRequestSeqRef.current;
        try {
            const effectiveTab = navbarStatus === 'reports'
                ? activeTab
                : (navbarStatus === 'total' ? activeTab : navbarStatus);

            // Use correct backend param names: tab, platform, search, from, to
            const params = {
                tab: effectiveTab === 'fir' ? 'fir' : effectiveTab, // backend expects "fir" not "converted_to_fir"
                limit: 30,
            };

            // Top navbar status filter should control the list payload, not just the count chips.
            if (navbarStatus && navbarStatus !== 'total' && navbarStatus !== 'reports') {
                params.status_filter = navbarStatus;
            }

            // Apply navbar platform filter (takes precedence). "all" = no platform param.
            if (navbarPlatform && navbarPlatform !== 'all') {
                params.platform = navbarPlatform;
            } else if (platformFilter && platformFilter !== 'all') {
                params.platform = platformFilter;
            }
            // Apply handle filter
            if (selectedHandle) {
                params.handle = selectedHandle;
            }

            if (debouncedSearch) params.search = debouncedSearch;
            if (dateRange.from) params.from = dateRange.from.toISOString();
            if (dateRange.to) params.to = dateRange.to.toISOString();
            if (cursor) params.cursor = cursor;

            const res = await GrievanceService.list(params);
            if (requestSeq !== grievancesRequestSeqRef.current) return;

            const data = res.data;
            const rows = Array.isArray(data.grievances) ? data.grievances : [];

            if (cursor) {
                setGrievances(prev => [...prev, ...rows]);
            } else {
                setGrievances(rows);
            }
            setPagination({
                hasMore: data.pagination?.hasMore || false,
                nextCursor: data.pagination?.nextCursor || null,
                total: data.pagination?.total ?? 0
            });

            // Background enrichment: silently fetch missing parent/quoted tweet content
            const needsEnrich = (node) =>
                node && node.tweet_id && !(node.content?.text || node.content?.full_text);

            const hasMissingThreadChain = (ctx) =>
                Boolean(ctx?.in_reply_to?.tweet_id) && (!Array.isArray(ctx?.thread_chain) || ctx.thread_chain.length === 0);

            const threadChainNeedsEnrich = (ctx) =>
                Array.isArray(ctx?.thread_chain) && ctx.thread_chain.some(needsEnrich);

            const toEnrich = rows.filter(g => {
                const p = (g.platform || '').toLowerCase();
                if (p !== 'x' && p !== 'twitter') return false;
                const ctx = g.context || {};
                return (
                    needsEnrich(ctx.in_reply_to)
                    || needsEnrich(ctx.quoted)
                    || needsEnrich(ctx.reposted_from)
                    || needsEnrich(ctx.thread_parent)
                    || threadChainNeedsEnrich(ctx)
                    || hasMissingThreadChain(ctx)
                );
            });
            if (toEnrich.length > 0) {
                toEnrich.forEach(g => {
                    api.post(`/grievances/${g.id || g._id}/enrich-context`)
                        .then(res => {
                            if (res.data?.enriched && res.data?.grievance) {
                                const enriched = res.data.grievance;
                                setGrievances(prev => prev.map(item =>
                                    (item.id || item._id) === (enriched.id || enriched._id) ? enriched : item
                                ));
                            }
                        })
                        .catch(() => { /* silent */ });
                });
            }
        } catch (error) {
            if (requestSeq !== grievancesRequestSeqRef.current) return;
            toast.error('Failed to load grievances');
            console.error(error);
        } finally {
            if (requestSeq === grievancesRequestSeqRef.current) {
                setLoading(false);
                setLoadingMore(false);
            }
        }
    }, [navbarStatus, allowedNavbarStatuses, activeTab, navbarPlatform, platformFilter, selectedHandle, debouncedSearch, dateRange]);

    useEffect(() => { fetchSources(); }, []);
    useEffect(() => {
        if (!navbarStatus) return;
        if (!allowedNavbarStatuses.includes(navbarStatus)) return;
        fetchDashboardStats();
        fetchGrievances();
    }, [activeTab, platformFilter, dateRange, debouncedSearch, navbarPlatform, navbarStatus, selectedHandle, allowedNavbarStatuses, fetchDashboardStats, fetchGrievances]);

    loadingMoreRef.current = loadingMore;
    grievanceLoadMoreRef.current = () => {
        if (!pagination.hasMore || loading || loadingMoreRef.current || !pagination.nextCursor) return;
        fetchGrievances(pagination.nextCursor);
    };

    // Infinite scroll like Alerts: observe against layout <main>
    useEffect(() => {
        const el = grievanceSentinelRef.current;
        if (!el || !pagination.hasMore || !pagination.nextCursor || grievances.length === 0) {
            return undefined;
        }
        const root = document.querySelector('main') || getScrollParent(el);
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting) grievanceLoadMoreRef.current();
            },
            { root, rootMargin: '300px', threshold: 0.1 }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [pagination.hasMore, pagination.nextCursor, grievances.length === 0]);

    /* ─── Source Management ─── */
    const handleAddSource = async () => {
        if (!addSourceHandle.trim()) {
            toast.error('Please enter an account handle or ID');
            return;
        }
        setAddingSource(true);
        try {
            const platform =
                navbarPlatform === 'facebook' ? 'facebook' : 'x';
            const res = await GrievanceService.addSource({
                handle: addSourceHandle.trim(),
                platform,
                department: addSourceDept || undefined,
            });
            toast.success(`Source "${res.data.display_name || addSourceHandle}" added successfully`);
            toast.info('Tip: add accounts on Social Profiles for catalog monitoring');
            await fetchSources();
            setShowAddSource(false);
            setAddSourceHandle('');
            setAddSourceDept('');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to add source');
        } finally {
            setAddingSource(false);
        }
    };

    const handleDeleteSource = async (source) => {
        try {
            if (source?.store === 'catalog') {
                const idToDelete = source?.catalog_account_id || source?.id;
                await socialProfilesApi.remove(idToDelete);
            } else {
                await GrievanceService.deleteSource(source.id);
            }
            toast.success(`Source "${source.handle}" removed`);
            setSources(prev => prev.filter(s => s.id !== source.id));
            setDeleteConfirmSource(null);
            fetchSources();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Failed to delete source');
        }
    };

    const handleFetchForSource = async (source, startDate, endDate) => {
        setFetchingSource(source.id);
        try {
            const res = await GrievanceService.fetchSource(source.id, {
                start_date: startDate || undefined,
                end_date: endDate || undefined,
            });
            const newCount = res.data?.newGrievances || 0;
            toast.success(`Fetched ${newCount} new grievance${newCount !== 1 ? 's' : ''} for ${source.handle}`);
            fetchGrievances();
            fetchDashboardStats();
            fetchSources();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to fetch grievances for source');
        } finally {
            setFetchingSource(null);
            setFetchDateDialog(null);
        }
    };

    // Always call the newest loaders: a fetch that started on one tab can finish after the user switched tabs.
    const latestLoaders = useRef({});
    latestLoaders.current = { fetchGrievances, fetchDashboardStats, fetchSources };
    const lastAutoFetchRef = useRef({});
    const AUTO_FETCH_COOLDOWN_MS = 5 * 60 * 1000;

    /**
     * Fetch mentions for one platform tab (or every watched account when platform is 'all').
     * auto = triggered by clicking a tab: quiet when nothing is new, and never falls back to "fetch everything".
     */
    const fetchForPlatform = async (platform, { auto = false } = {}) => {
        const want = String(platform || 'all').toLowerCase();
        const targets = (
            want === 'all'
                ? sources
                : sources.filter((s) => {
                    const p = String(s.platform || '').toLowerCase();
                    if (want === 'x' || want === 'twitter') return p === 'x' || p === 'twitter';
                    return p === want;
                  })
        ).filter((s) => s?.id);

        if (auto && targets.length === 0) return;

        setFetchingSource('all');
        try {
            if (targets.length === 0) {
                const res = await GrievanceService.fetchAll();
                const newCount = res.data?.newGrievances || 0;
                toast.success(`Fetched ${newCount} new grievance${newCount !== 1 ? 's' : ''}`);
            } else {
                let newCount = 0;
                let failCount = 0;
                for (const source of targets) {
                    try {
                        const res = await GrievanceService.fetchSource(source.id, {});
                        newCount += res.data?.newGrievances || 0;
                    } catch (err) {
                        failCount += 1;
                        console.error('Fetch failed for', source.handle, err);
                    }
                }
                if (failCount > 0 && newCount === 0) {
                    toast.error(`Fetch failed for ${failCount} account${failCount !== 1 ? 's' : ''}. Check platform credentials and try again.`);
                } else if (failCount > 0) {
                    toast.success(`Fetched ${newCount} new · ${failCount} account${failCount !== 1 ? 's' : ''} failed`);
                } else if (!auto || newCount > 0) {
                    toast.success(`Fetched ${newCount} new grievance${newCount !== 1 ? 's' : ''}`);
                }
            }
            latestLoaders.current.fetchGrievances();
            latestLoaders.current.fetchDashboardStats();
            latestLoaders.current.fetchSources();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Failed to fetch grievances');
        } finally {
            setFetchingSource(null);
        }
    };

    // Button: fetch the tab that is open right now.
    const handleFetchAll = () => fetchForPlatform(navbarPlatform);

    // Clicking a platform tab fetches that platform (at most once per 5 minutes per platform).
    // Clicking "All" fetches every watched account on every platform, on each click.
    // The Reports view never auto-fetches, and a click while a fetch is already running is ignored.
    const handlePlatformTabClick = (platformId) => {
        if (!platformId || navbarStatus === 'reports' || fetchingSource) return;
        if (platformId !== 'all') {
            const last = lastAutoFetchRef.current[platformId] || 0;
            if (Date.now() - last < AUTO_FETCH_COOLDOWN_MS) return;
            lastAutoFetchRef.current[platformId] = Date.now();
        }
        fetchForPlatform(platformId, { auto: true });
    };

    const handleUpdateGrievanceWorkflowStatus = async (grievance, status) => {
        const reportKey =
            grievance?.grievance_workflow?.report_id ||
            grievance?.grievance_workflow?.unique_code ||
            grievance?.grievance_workflow?.id;
        if (!reportKey) {
            toast.error('Unique ID not generated yet for this post');
            return;
        }

        // ESCALATED or CLOSED → open multi-step popup
        if (['ESCALATED', 'CLOSED'].includes(status)) {
            setStatusChangePopup({ grievance, targetStatus: status });
            return;
        }

        // PENDING → direct API call (Postgres report module)
        try {
            const res = await api.put(`/grievance-workflow/reports/${reportKey}/status`, { status });
            const nextStatus = res?.data?.status || status;
            triggerActionBlink(grievance.id);

            setGrievances(prev => prev.map(item => (
                item.id === grievance.id
                    ? {
                        ...item,
                        grievance_workflow: {
                            ...(item.grievance_workflow || {}),
                            status: nextStatus,
                            report_id: res?.data?.id || item.grievance_workflow?.report_id,
                        }
                    }
                    : item
            )));

            toast.success(`Status updated to ${nextStatus}`);
        } catch (error) {
            toast.error(error?.response?.data?.error || 'Failed to update grievance workflow status');
        }
    };

    const handleStatusChangeComplete = (grievanceId, newStatus) => {
        triggerActionBlink(grievanceId);
        setGrievances(prev => prev.map(item => (
            item.id === grievanceId
                ? {
                    ...item,
                    grievance_workflow: {
                        ...(item.grievance_workflow || {}),
                        status: newStatus
                    }
                }
                : item
        )));
    };

    const triggerActionBlink = (id) => {
        if (!id) return;
        setActionedGrievanceIds(prev => prev.includes(id) ? prev : [...prev, id]);
    };

    const clearActionBlink = (id) => {
        if (!id) return;
        setActionedGrievanceIds(prev => prev.filter(item => item !== id));
    };

    const handleGrievanceReportCreated = (originalGrievanceId, report) => {
        if (!originalGrievanceId || !report) return;
        triggerActionBlink(originalGrievanceId);

        const nextWorkflow = {
            report_id: report.id,
            unique_code: report.unique_code,
            status: report.status || 'PENDING'
        };

        setGrievances(prev => prev.map(item => (
            item.id === originalGrievanceId
                ? {
                    ...item,
                    grievance_workflow: {
                        ...(item.grievance_workflow || {}),
                        ...nextWorkflow
                    }
                }
                : item
        )));

        setSelectedGrievance(prev => (
            prev?.id === originalGrievanceId
                ? {
                    ...prev,
                    grievance_workflow: {
                        ...(prev.grievance_workflow || {}),
                        ...nextWorkflow
                    }
                }
                : prev
        ));

        setGrievancePopupGrievance(prev => (
            prev?.id === originalGrievanceId
                ? {
                    ...prev,
                    grievance_workflow: {
                        ...(prev.grievance_workflow || {}),
                        ...nextWorkflow
                    }
                }
                : prev
        ));

        fetchDashboardStats();
    };

    const handleSuggestionReportCreated = (originalGrievanceId, report) => {
        if (!originalGrievanceId || !report) return;
        triggerActionBlink(originalGrievanceId);

        const nextSuggestion = {
            report_id: report.id,
            unique_code: report.unique_code,
            category: report.category
        };

        setGrievances(prev => prev.map(item => (
            item.id === originalGrievanceId
                ? {
                    ...item,
                    suggestion: {
                        ...(item.suggestion || {}),
                        ...nextSuggestion
                    }
                }
                : item
        )));

        setSelectedGrievance(prev => (
            prev?.id === originalGrievanceId
                ? {
                    ...prev,
                    suggestion: {
                        ...(prev.suggestion || {}),
                        ...nextSuggestion
                    }
                }
                : prev
        ));

        setSuggestionPopupGrievance(prev => (
            prev?.id === originalGrievanceId
                ? {
                    ...prev,
                    suggestion: {
                        ...(prev.suggestion || {}),
                        ...nextSuggestion
                    }
                }
                : prev
        ));

        fetchDashboardStats();
    };

    const handleCriticismReportCreated = (criticismReport, grievanceId) => {
        if (!grievanceId || !criticismReport) return;
        triggerActionBlink(grievanceId);

        const nextCriticism = {
            ...(criticismReport || {}),
            report_id: criticismReport.report_id || criticismReport.id,
            unique_code: criticismReport.unique_code,
            shared_at: criticismReport.shared_at || null,
            action_taken_at: criticismReport.action_taken_at || null,
        };

        setGrievances(prev => prev.map(g =>
            g.id === grievanceId
                ? {
                    ...g,
                    criticism: {
                        ...(g.criticism || {}),
                        ...nextCriticism
                    }
                }
                : g
        ));

        setSelectedGrievance(prev => (
            prev?.id === grievanceId
                ? {
                    ...prev,
                    criticism: {
                        ...(prev.criticism || {}),
                        ...nextCriticism
                    }
                }
                : prev
        ));

        setCriticismGrievance(prev => (
            prev?.id === grievanceId
                ? {
                    ...prev,
                    criticism: {
                        ...(prev.criticism || {}),
                        ...nextCriticism
                    }
                }
                : prev
        ));

        fetchDashboardStats();
    };

    /* ─── Card Actions ─── */
    const handleAction = (action, { grievance, media, status }) => {
        setSelectedGrievance(grievance);
        if (action === 'view') {
            setIsDetailOpen(true);
        } else if (action === 'update_status') {
            setNewStatus(grievance.workflow_status || 'received');
            setStatusUpdateNote('');
            setIsStatusOpen(true);
        } else if (action === 'convert_to_fir') {
            setFirNote('');
            setFirNumber('');
            setIsFirConfirmOpen(true);
        } else if (action === 'view_media') {
            setSelectedMedia(toPreviewMedia(media));
            setIsMediaOpen(true);
        } else if (action === 'reply_comment') {
            clearActionBlink(grievance.id);
            setReplyCommentDialog({ open: true, grievance, message: '', submitting: false });
        } else if (action === 'share_to_excel') {
            // Pre-fill modal with grievance data
            const complainantName = grievance.posted_by?.display_name || grievance.complainant_phone || 'Unknown';
            const content = grievance.content?.full_text || grievance.content?.text || '';
            setPreFilledRow({
                callerNumber: grievance.complainant_phone || grievance.posted_by?.handle || '',
                mentionName: complainantName,
                contents: content,
                receivedTime: new Date().toISOString().slice(0, 16),
            });
            setShowExcelModal(true);
        } else if (action === 'download') {
            downloadMediaForGrievance(grievance);
        } else if (action === 'classify_criticism') {
            setCriticismGrievance(grievance);
        } else if (action === 'classify_grievance') {
            setGrievancePopupGrievance(grievance);
        } else if (action === 'classify_suggestion') {
            setSuggestionPopupGrievance(grievance);
        } else if (action === 'open_g_report') {
            const uniqueCode = grievance?.grievance_workflow?.unique_code || '';
            if (!uniqueCode) {
                toast.error('No grievance report code found for this card');
                return;
            }
            setSelectedReportTypes({ grievance: true, suggestion: false, criticism: false });
            setNavbarStatus('reports');
            setOpenGReportCode(uniqueCode);
        } else if (action === 'open_s_report') {
            const uniqueCode = grievance?.suggestion?.unique_code || '';
            if (!uniqueCode) {
                toast.error('No suggestion report code found for this card');
                return;
            }
            setSelectedReportTypes({ grievance: false, suggestion: true, criticism: false });
            setNavbarStatus('reports');
            setOpenSReportCode(uniqueCode);
        } else if (action === 'open_c_report') {
            const uniqueCode = grievance?.criticism?.unique_code || '';
            if (!uniqueCode) {
                toast.error('No criticism report code found for this card');
                return;
            }
            setSelectedReportTypes({ grievance: false, suggestion: false, criticism: true });
            setNavbarStatus('reports');
            setOpenCReportCode(uniqueCode);
        } else if (action === 'update_g_workflow_status') {
            handleUpdateGrievanceWorkflowStatus(grievance, status);
        } else if (action === 'retry_enrich') {
            const gId = grievance?.id || grievance?._id;
            if (!gId) return;
            api.post(`/grievances/${gId}/enrich-context`)
                .then(res => {
                    if (res.data?.enriched && res.data?.grievance) {
                        const enriched = res.data.grievance;
                        setGrievances(prev => prev.map(item =>
                            (item.id || item._id) === (enriched.id || enriched._id) ? enriched : item
                        ));
                        toast.success('Tweet context refreshed');
                    } else {
                        toast.info('No new content found — the original post may be unavailable');
                    }
                })
                .catch(() => {
                    toast.error('Failed to enrich tweet context');
                });
        }
    };

    // Handler for updating a grievance report status inline
    const handleUpdateGrievanceWorkflowStatusInline = async (grievance, newStatus) => {
        try {
            const reportKey =
                grievance?.grievance_workflow?.report_id ||
                grievance?.grievance_workflow?.unique_code ||
                grievance?.grievance_workflow?.id;
            if (!reportKey) {
                toast.error('Unique ID not generated yet for this post');
                return;
            }
            await api.put(`/grievance-workflow/reports/${reportKey}/status`, {
                status: newStatus
            });
            triggerActionBlink(grievance.id);
            toast.success('Report status updated');
        } catch (error) {
            toast.error('Failed to update report status');
        }
    };

    const handleUpdateStatus = async () => {
        if (!selectedGrievance) return;
        setUpdatingStatus(true);
        try {
            await api.put(`/grievances/${selectedGrievance.id}/workflow`, {
                workflow_status: newStatus,
                note: statusUpdateNote || undefined,
            });
            triggerActionBlink(selectedGrievance.id);
            toast.success('Status updated successfully');
            setIsStatusOpen(false);

            // Add delay so user can see the blink before it vanishes to another tab
            setTimeout(() => {
                // Switch to the tab matching the new status
                const statusTabMap = {
                    received: 'pending',
                    reviewed: 'pending',
                    action_taken: 'pending',
                    closed: 'closed',
                    converted_to_fir: 'fir'
                };
                const targetTab = statusTabMap[newStatus] || 'all';
                setActiveTab(targetTab);
                setGrievances([]);
                fetchGrievances();
                fetchDashboardStats();
            }, 1000);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to update status');
        } finally {
            setUpdatingStatus(false);
        }
    };

    const handleConvertToFir = async () => {
        if (!selectedGrievance) return;
        setUpdatingStatus(true);
        try {
            await api.post(`/grievances/${selectedGrievance.id}/convert-to-fir`, {
                note: firNote || undefined,
                fir_number: firNumber || undefined,
            });
            triggerActionBlink(selectedGrievance.id);
            toast.success('Grievance converted to FIR');
            setIsFirConfirmOpen(false);

            setTimeout(() => {
                // Switch to FIR tab
                setActiveTab('fir');
                setGrievances([]);
                fetchGrievances();
                fetchDashboardStats();
            }, 1000);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to convert to FIR');
        } finally {
            setUpdatingStatus(false);
        }
    };

    const clearFilters = () => {
        setSearchQuery('');
        setPlatformFilter('all');
        setDateRange({ from: null, to: null });
        setNavbarPlatform('all');
        setNavbarStatus('total');
        setActiveTab('all');
        setSelectedHandle(null);
    };

    const hasActiveFilters = Boolean(dateRange.from || debouncedSearch || selectedHandle);
    const isReportsTab = navbarStatus === 'reports';
    const hasNoCatalogData = !hasActiveFilters && Number(stats?.total || 0) === 0 && grievances.length === 0;

    const totalReportModules = useMemo(() => {
        const g = Number(reportTypeCounts.grievance ?? 0);
        const s = Number(reportTypeCounts.suggestion ?? 0);
        const c = Number(reportTypeCounts.criticism ?? 0);
        return g + s + c;
    }, [reportTypeCounts]);

    const reportsExecutiveKpis = useMemo(
        () => [
            {
                key: 'all',
                label: 'Total records',
                value: totalReportModules.toLocaleString(),
                hint: 'G + S + C formal reports',
                icon: BarChart3,
                iconClass: 'text-indigo-500',
                valueClass: 'text-indigo-600 dark:text-indigo-400',
            },
            {
                key: 'grievance',
                label: 'Grievance (G)',
                value:
                    reportTypeCounts.grievance == null
                        ? '…'
                        : Number(reportTypeCounts.grievance).toLocaleString(),
                hint: 'Workflow case files',
                icon: Shield,
                iconClass: 'text-amber-500',
                valueClass: 'text-foreground',
            },
            {
                key: 'suggestion',
                label: 'Suggestion (S)',
                value:
                    reportTypeCounts.suggestion == null
                        ? '…'
                        : Number(reportTypeCounts.suggestion).toLocaleString(),
                hint: 'Citizen suggestions',
                icon: Users,
                iconClass: 'text-violet-500',
                valueClass: 'text-foreground',
            },
            {
                key: 'criticism',
                label: 'Criticism (C)',
                value:
                    reportTypeCounts.criticism == null
                        ? '…'
                        : Number(reportTypeCounts.criticism).toLocaleString(),
                hint: 'Critical commentary dossiers',
                icon: Flame,
                iconClass: 'text-rose-500',
                valueClass: 'text-foreground',
            },
            {
                key: 'watched',
                label: 'Watched Accounts',
                value: String(sources.length),
                hint: `${navbarPlatform === 'all' ? 'All platforms' : navbarPlatform.toUpperCase()} monitoring`,
                icon: Activity,
                iconClass: 'text-sky-500',
                valueClass: 'text-foreground',
            },
        ],
        [totalReportModules, reportTypeCounts, sources.length, navbarPlatform]
    );

    useEffect(() => {
        if (!isReportsTab) return undefined;
        let cancelled = false;

        const loadCounts = async () => {
            try {
                const [gRes, sRes, cRes] = await Promise.all([
                    api.get('/grievance-workflow/reports', { params: { page: 1, limit: 1 } }).catch(() => null),
                    api.get('/suggestion/reports', { params: { page: 1, limit: 1 } }).catch(() => null),
                    api.get('/criticism/reports', { params: { page: 1, limit: 1 } }).catch(() => null),
                ]);
                if (cancelled) return;
                setReportTypeCounts({
                    grievance: Number(
                        gRes?.data?.stats?.total ?? gRes?.data?.pagination?.total ?? 0
                    ),
                    suggestion: Number(sRes?.data?.pagination?.total ?? 0),
                    criticism: Number(cRes?.data?.pagination?.total ?? 0),
                });
            } catch {
                if (!cancelled) {
                    setReportTypeCounts({ grievance: 0, suggestion: 0, criticism: 0 });
                }
            }
        };

        loadCounts();
        return () => {
            cancelled = true;
        };
    }, [isReportsTab]);

    const handleReportCountsUpdate = useCallback((counts) => {
        if (!counts) return;
        setReportTypeCounts({
            grievance: Number(counts.grievance ?? 0),
            suggestion: Number(counts.suggestion ?? 0),
            criticism: Number(counts.criticism ?? 0),
        });
    }, []);

    const handleGrievanceWorkflowStatsUpdate = useCallback((next) => {
        if (next) setWorkflowStats(next);
    }, []);

    /* ═══════════════════════════════════════════════════════════════ */
    /*                           RENDER                              */
    /* ═══════════════════════════════════════════════════════════════ */
    return (
        <div className="space-y-3 max-w-[1600px] mx-auto" data-testid="grievances-page">
            <GrievanceTopNavbar
                activePlatform={navbarPlatform}
                onPlatformChange={setNavbarPlatform}
                onPlatformClick={handlePlatformTabClick}
                activeStatus={navbarStatus}
                onStatusChange={setNavbarStatus}
                selectedHandle={selectedHandle}
                onHandleChange={setSelectedHandle}
                stats={stats}
                workflowStats={workflowStats}
                grievances={grievances}
                sources={sources}
                allowedStatuses={allowedNavbarStatuses}
                allowedPlatforms={grievancePlatformRows}
                onConfigureSettings={() => navigate('/settings?tab=grievances')}
                onFetchSourceHistory={(source) => handleFetchForSource(source)}
                onFetchAll={handleFetchAll}
                fetchingAll={fetchingSource === 'all'}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
            />

            {/* ─── Reports Tab Content (same shell as Feed) ─── */}
            {isReportsTab && (
                <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
                    <GrievanceExecutiveHeader
                        user={authUser}
                        variant="feed"
                        embedded
                        scopeLine={`Unified registry · ${totalReportModules.toLocaleString()} formal records (G / S / C) · ${sources.length} watched account${sources.length === 1 ? '' : 's'} · ${navbarPlatform === 'all' ? 'All platforms' : String(navbarPlatform).toUpperCase()}`}
                        kpis={reportsExecutiveKpis}
                    />
                    <GrievanceUnifiedReports
                        embedded
                        typeCounts={reportTypeCounts}
                        onGrievanceStatsUpdate={handleGrievanceWorkflowStatsUpdate}
                        onReportCountsUpdate={handleReportCountsUpdate}
                        openGReportCode={openGReportCode}
                        openSReportCode={openSReportCode}
                        openCReportCode={openCReportCode}
                        onGReportCodeHandled={() => setOpenGReportCode('')}
                        onSReportCodeHandled={() => setOpenSReportCode('')}
                        onCReportCodeHandled={() => setOpenCReportCode('')}
                    />
                </div>
            )}

            {/* ─── Feed ─── */}
            {!isReportsTab && (
                <div className="space-y-4">
                <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <Loader2 className="h-7 w-7 animate-spin text-muted-foreground mb-2" />
                            <p className="text-sm text-muted-foreground">Loading grievances…</p>
                        </div>
                    ) : grievances.length === 0 ? (
                        <div className="text-center py-14 px-6">
                            <FileText className="h-9 w-9 mx-auto text-muted-foreground/40 mb-2" />
                            <h3 className="text-base font-semibold">No grievances yet</h3>
                            <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
                                {hasActiveFilters
                                    ? 'Nothing matches the current search or account filter.'
                                    : hasNoCatalogData
                                        ? sources.length === 0
                                            ? 'Add official accounts in Settings > Grievances, then use Fetch mentions to pull activity.'
                                            : navbarPlatform === 'facebook' || navbarPlatform === 'instagram'
                                                ? 'Click Fetch posts & comments to pull page activity.'
                                                : 'Click Fetch mentions to pull @tags from watched accounts.'
                                        : 'No matching grievances for this view.'}
                            </p>
                            <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
                                {hasActiveFilters ? (
                                    <Button variant="outline" size="sm" onClick={clearFilters}>
                                        Clear filters
                                    </Button>
                                ) : sources.length === 0 ? (
                                    <Button size="sm" onClick={() => navigate('/settings?tab=grievances')}>
                                        Configure in Settings
                                    </Button>
                                ) : (
                                    <Button
                                        size="sm"
                                        onClick={handleFetchAll}
                                        disabled={fetchingSource === 'all'}
                                    >
                                        {fetchingSource === 'all' ? (
                                            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                                        ) : (
                                            <RefreshCw className="h-4 w-4 mr-1.5" />
                                        )}
                                        {navbarPlatform === 'facebook' || navbarPlatform === 'instagram'
                                          ? 'Fetch posts & comments'
                                          : 'Fetch mentions'}
                                    </Button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div>
                            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/20 text-xs text-muted-foreground">
                                <span>
                                    Showing <span className="font-semibold text-foreground">{grievances.length}</span>
                                    {pagination.total ? ` of ${pagination.total}` : ''} results
                                </span>
                                {hasActiveFilters && (
                                    <button
                                        type="button"
                                        className="text-primary hover:underline"
                                        onClick={clearFilters}
                                    >
                                        Clear filters
                                    </button>
                                )}
                            </div>

                            <div className="p-3">
                                <div className="columns-1 md:columns-2 xl:columns-3 gap-3 [column-fill:_balance]">
                                    {grievances.map((grievance) => (
                                        <div key={grievance.id} className="break-inside-avoid mb-3">
                                            <GrievanceCard
                                                grievance={grievance}
                                                onAction={handleAction}
                                                getProxiedMediaUrl={getProxiedMediaUrl}
                                                downloadState={downloadStates[grievance.id]}
                                                isSelected={selectedGrievance?.id === grievance.id}
                                                isActioned={actionedGrievanceIds.includes(grievance.id)}
                                            />
                                        </div>
                                    ))}
                                </div>

                                {pagination.hasMore && (
                                    <div ref={grievanceSentinelRef} className="flex items-center justify-center py-4 min-h-8">
                                        {loadingMore && (
                                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
                </div>
            )}

            {/* Criticism Popup */}
            {criticismGrievance && (
                <CriticismPopup
                    grievance={criticismGrievance}
                    onClose={() => setCriticismGrievance(null)}
                    onReportCreated={handleCriticismReportCreated}
                    userName={userName}
                />
            )}

            {/* Grievance Workflow Popup */}
            {grievancePopupGrievance && (
                <GrievancePopup
                    grievance={grievancePopupGrievance}
                    onClose={() => setGrievancePopupGrievance(null)}
                    onReportCreated={handleGrievanceReportCreated}
                    userName={userName}
                />
            )}

            {/* Grievance Status Change Popup (ESCALATED / CLOSED) */}
            {statusChangePopup && (
                <GrievanceStatusChangePopup
                    grievance={statusChangePopup.grievance}
                    targetStatus={statusChangePopup.targetStatus}
                    onClose={() => setStatusChangePopup(null)}
                    onStatusUpdated={handleStatusChangeComplete}
                    userName={userName}
                />
            )}

            {/* Suggestion Popup */}
            {suggestionPopupGrievance && (
                <SuggestionPopup
                    grievance={suggestionPopupGrievance}
                    onClose={() => setSuggestionPopupGrievance(null)}
                    onReportCreated={handleSuggestionReportCreated}
                    userName={userName}
                />
            )}

            {/* ═══════════════════════════════════════════════════════════ */}
            {/*                        DIALOGS                            */}
            {/* ═══════════════════════════════════════════════════════════ */}

            {/* Excel Sheet Modal */}
            <ExcelSheetModal
                open={showExcelModal}
                onOpenChange={setShowExcelModal}
                rows={excelRows}
                setRows={setExcelRows}
                modalPos={modalPos}
                setModalPos={setModalPos}
                modalSize={modalSize}
                setModalSize={setModalSize}
                isDragging={isDraggingModal}
                setIsDragging={setIsDraggingModal}
                dragOffset={dragOffset}
                setDragOffset={setDragOffset}
                isResizing={isResizingModal}
                setIsResizing={setIsResizingModal}
                modalRef={modalRef}
                preFilledRow={preFilledRow}
                setPreFilledRow={setPreFilledRow}
                userName={userName}
            />

            {/* Add Source Dialog */}
            <Dialog open={showAddSource} onOpenChange={setShowAddSource}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Plus className="h-5 w-5" /> Add Government Account
                        </DialogTitle>
                        <DialogDescription>
                            Add an X (Twitter) government account to monitor for tagged grievances.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label>Twitter Handle</Label>
                            <Input
                                placeholder="@government_handle"
                                value={addSourceHandle}
                                onChange={(e) => setAddSourceHandle(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                                Enter the X handle without @ symbol
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label>Department <span className="text-muted-foreground">(optional)</span></Label>
                            <Input
                                placeholder="e.g., Police Department"
                                value={addSourceDept}
                                onChange={(e) => setAddSourceDept(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAddSource(false)}>Cancel</Button>
                        <Button onClick={handleAddSource} disabled={addingSource || !addSourceHandle.trim()}>
                            {addingSource ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Adding...</> : 'Add Source'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Optional historical fetch — calendar only when explicitly opened */}
            <Dialog open={!!fetchDateDialog} onOpenChange={(open) => { if (!open) setFetchDateDialog(null); }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Historical fetch · {fetchDateDialog?.handle}</DialogTitle>
                        <DialogDescription>
                            Leave empty for recent, or pick a range for older mentions.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-2 flex justify-center">
                        <CalendarComponent
                            mode="range"
                            selected={fetchDateRange}
                            onSelect={setFetchDateRange}
                            numberOfMonths={1}
                        />
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => { setFetchDateDialog(null); setFetchDateRange({ from: null, to: null }); }}>Cancel</Button>
                        <Button onClick={() => {
                            if (!fetchDateDialog) return;
                            handleFetchForSource(
                                fetchDateDialog,
                                fetchDateRange.from?.toISOString(),
                                fetchDateRange.to?.toISOString()
                            );
                            setFetchDateRange({ from: null, to: null });
                        }}>
                            Fetch
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Source Confirmation */}
            <Dialog open={!!deleteConfirmSource} onOpenChange={(open) => { if (!open) setDeleteConfirmSource(null); }}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="text-red-600">Remove Source</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to remove <strong>{deleteConfirmSource?.handle}</strong>?
                            Existing grievances will not be deleted.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteConfirmSource(null)}>Cancel</Button>
                        <Button variant="destructive" onClick={() => handleDeleteSource(deleteConfirmSource)}>Remove</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Status Update Dialog */}
            <Dialog open={isStatusOpen} onOpenChange={setIsStatusOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Update Workflow Status</DialogTitle>
                        <DialogDescription>
                            Change the workflow status for complaint {selectedGrievance?.complaint_code || selectedGrievance?.id?.substring(0, 8)}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-3">
                        {selectedGrievance && (
                            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 text-sm">
                                <span className="text-muted-foreground">Current status: </span>
                                <span className="font-medium capitalize">{(selectedGrievance.workflow_status || 'received').replace(/_/g, ' ')}</span>
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label>New Status</Label>
                            <Select value={newStatus} onValueChange={setNewStatus}>
                                <SelectTrigger><SelectValue placeholder="Select Status" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="received">Received (Pending)</SelectItem>
                                    <SelectItem value="reviewed">Reviewed</SelectItem>
                                    <SelectItem value="action_taken">Action Taken</SelectItem>
                                    <SelectItem value="closed">Closed (Resolved)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Remarks / Note</Label>
                            <Textarea
                                placeholder="Add a note about this status update..."
                                value={statusUpdateNote}
                                onChange={(e) => setStatusUpdateNote(e.target.value)}
                                rows={3}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsStatusOpen(false)}>Cancel</Button>
                        <Button onClick={handleUpdateStatus} disabled={updatingStatus}>
                            {updatingStatus ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Update Status
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Convert to FIR Dialog */}
            <Dialog open={isFirConfirmOpen} onOpenChange={setIsFirConfirmOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="text-red-600 flex items-center gap-2">
                            <AlertCircle className="h-5 w-5" />
                            Confirm FIR Conversion
                        </DialogTitle>
                        <DialogDescription>
                            This will mark the grievance as "Converted to FIR" and log the timestamp.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-3">
                        <div className="bg-red-50 p-3 rounded-lg border border-red-200">
                            <p className="text-sm text-red-800">
                                <strong>Warning:</strong> This action initiates the formal FIR process. Ensure all preliminary reviews are complete before proceeding.
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label>FIR Number <span className="text-muted-foreground">(optional)</span></Label>
                            <Input
                                placeholder="Enter FIR number if available"
                                value={firNumber}
                                onChange={(e) => setFirNumber(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Official Remarks</Label>
                            <Textarea
                                placeholder="Enter reason or reference for FIR conversion..."
                                value={firNote}
                                onChange={(e) => setFirNote(e.target.value)}
                                rows={3}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsFirConfirmOpen(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleConvertToFir} disabled={updatingStatus}>
                            {updatingStatus ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Convert to FIR
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Details Modal */}
            <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh]">
                    <DialogHeader>
                        <DialogTitle>Grievance Details</DialogTitle>
                    </DialogHeader>
                    {selectedGrievance && (
                        <ScrollArea className="max-h-[70vh] pr-4">
                            <div className="space-y-6">
                                {/* Info grid */}
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <InfoField label="Complaint Code" value={selectedGrievance.complaint_code || selectedGrievance.id?.substring(0, 8)} />
                                    <InfoField label="Platform" value={<span className="capitalize">{selectedGrievance.platform}</span>} />
                                    <InfoField label="Complainant" value={selectedGrievance.posted_by?.display_name || selectedGrievance.posted_by?.handle || selectedGrievance.complainant_phone || 'Unknown'} />
                                    <InfoField label="Date Received" value={selectedGrievance.post_date ? format(new Date(selectedGrievance.post_date), 'PPP p') : 'N/A'} />
                                    <InfoField label="Current Status" value={
                                        <Badge variant="outline" className="capitalize">
                                            {(selectedGrievance.workflow_status || 'received').replace(/_/g, ' ')}
                                        </Badge>
                                    } />
                                    <InfoField label="Escalation Count" value={selectedGrievance.escalation_count || 0} />
                                    {selectedGrievance.tagged_account && <InfoField label="Tagged Account" value={selectedGrievance.tagged_account} />}
                                    {selectedGrievance.fir_number && <InfoField label="FIR Number" value={selectedGrievance.fir_number} />}
                                </div>

                                {/* Full Tweet Thread — mirrors GrievanceCard XLayout */}
                                {(() => {
                                    const ctx = selectedGrievance.context || {};
                                    const platform = (selectedGrievance.platform || 'x').toLowerCase();
                                    const isX = platform === 'x' || platform === 'twitter';

                                    // Helper: does this context node have displayable content?
                                    const hasCtxContent = (node) =>
                                        node && (
                                            Boolean(String(node.content?.full_text || node.content?.text || '').trim())
                                            || (Array.isArray(node.content?.media) && node.content.media.length > 0)
                                        );

                                    const hasCtxReference = (node) =>
                                        node && (node.tweet_id || node.tweet_url || node.url || node.id);

                                    // Determine thread ancestors
                                    const threadParent = hasCtxReference(ctx.thread_parent) ? ctx.thread_parent : null;
                                    const inReplyTo = hasCtxReference(ctx.in_reply_to) ? ctx.in_reply_to : null;
                                    const quotedCtx = hasCtxReference(ctx.quoted) ? ctx.quoted : null;
                                    const threadChain = Array.isArray(ctx.thread_chain)
                                        ? ctx.thread_chain.filter(hasCtxReference)
                                        : [];

                                    const fallbackAncestors = [];
                                    if (threadParent) fallbackAncestors.push(threadParent);
                                    if (inReplyTo && (!threadParent || threadParent?.tweet_id !== inReplyTo?.tweet_id)) {
                                        fallbackAncestors.push(inReplyTo);
                                    }

                                    const threadAncestors = (threadChain.length > 0 ? [...threadChain].reverse() : fallbackAncestors)
                                        .filter((node, index, list) => {
                                            const id = String(node?.tweet_id || '').trim();
                                            if (!id) return true;
                                            return list.findIndex((item) => String(item?.tweet_id || '').trim() === id) === index;
                                        });

                                    const buildCtxUrl = (node) => {
                                        const direct = String(node?.tweet_url || node?.url || '').trim();
                                        if (direct) return direct;
                                        const tweetId = String(node?.tweet_id || node?.id || '').trim();
                                        if (!tweetId) return '';
                                        const handle = String(node?.posted_by?.handle || '').replace(/^@/, '').trim();
                                        return handle
                                            ? `https://x.com/${handle}/status/${tweetId}`
                                            : `https://x.com/i/web/status/${tweetId}`;
                                    };

                                    const renderDetailMedia = (mediaItems = [], keyPrefix = 'context') => {
                                        const preparedMedia = mediaItems
                                            .map((item) => toPreviewMedia(item))
                                            .filter((item) => item && (item.url || item.preview_url || item.preview));

                                        if (!preparedMedia.length) return null;

                                        const useStackLayout = preparedMedia.length > 4;
                                        const visibleMedia = useStackLayout ? preparedMedia.slice(0, 5) : preparedMedia;
                                        const gridColumnsClass = preparedMedia.length === 1
                                            ? 'grid-cols-1'
                                            : preparedMedia.length === 2
                                                ? 'grid-cols-2'
                                                : 'grid-cols-3';

                                        return (
                                            <div className={cn('mt-2', useStackLayout ? 'space-y-2' : cn('grid gap-1', gridColumnsClass))}>
                                                {visibleMedia.map((previewMedia, i) => {
                                                    const mediaIsVideo = isVideoPreviewMedia(previewMedia);
                                                    const mediaTileClass = useStackLayout
                                                        ? 'w-full min-h-[220px] max-h-[70vh] border'
                                                        : preparedMedia.length === 1
                                                            ? (mediaIsVideo ? 'w-full aspect-video border' : 'w-full min-h-[320px] max-h-[70vh] border')
                                                            : (mediaIsVideo ? 'aspect-video' : 'aspect-square');

                                                    return (
                                                        <div key={`${keyPrefix}-${i}`} className="relative">
                                                            <DetailPopupMediaTile
                                                                media={previewMedia}
                                                                getProxiedMediaUrl={getProxiedMediaUrl}
                                                                activeVideoRef={activeDetailVideoRef}
                                                                className={cn(
                                                                    mediaTileClass,
                                                                    keyPrefix === 'main' && !useStackLayout && 'border'
                                                                )}
                                                                onImageClick={
                                                                    mediaIsVideo
                                                                        ? undefined
                                                                        : () => {
                                                                            setSelectedMedia(previewMedia);
                                                                            setIsMediaOpen(true);
                                                                        }
                                                                }
                                                            />
                                                            {useStackLayout && i === 4 && preparedMedia.length > 5 && (
                                                                <div className="absolute inset-x-0 bottom-0 bg-black/60 py-1.5 text-center">
                                                                    <span className="text-white text-sm font-semibold">+{preparedMedia.length - 5} more</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    };

                                    const renderContextTweet = (node, label) => {
                                        if (!node || !hasCtxReference(node)) return null;
                                        if (!hasCtxContent(node)) {
                                            const fallbackUrl = buildCtxUrl(node);
                                            return (
                                                <div key={label} className="relative pl-3 pb-2 border-l-2 border-slate-300 dark:border-slate-600">
                                                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
                                                    <div className="rounded-md border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                                                        Thread loading...
                                                        {fallbackUrl && (
                                                            <a
                                                                href={fallbackUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="ml-2 text-blue-500 hover:underline"
                                                            >
                                                                Open original →
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        }
                                        const user = node.posted_by || {};
                                        const handle = (user.handle || '').replace('@', '');
                                        const text = node.content?.full_text || node.content?.text || '';
                                        const media = node.content?.media || [];
                                        const contextUrl = buildCtxUrl(node);
                                        return (
                                            <div key={label} className="relative pl-3 pb-2 border-l-2 border-slate-300 dark:border-slate-600">
                                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
                                                <div className="flex items-center gap-2 mb-1">
                                                    {user.profile_image_url && (
                                                        <img src={getProxiedMediaUrl(user.profile_image_url)} alt="" className="h-6 w-6 rounded-full object-cover" referrerPolicy="no-referrer" onError={(e) => { e.target.style.display = 'none'; }} />
                                                    )}
                                                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{user.display_name || handle}</span>
                                                    {handle && <span className="text-xs text-slate-400">@{handle}</span>}
                                                    {node.post_date && <span className="text-[10px] text-slate-400">{format(new Date(node.post_date), 'MMM d, h:mm a')}</span>}
                                                </div>
                                                {text && <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">{text}</p>}
                                                {media.length > 0 && renderDetailMedia(media, `thread-${label}`)}
                                                {contextUrl && (
                                                    <a href={contextUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-500 hover:underline mt-1 inline-block">View original →</a>
                                                )}
                                            </div>
                                        );
                                    };

                                    return (
                                        <div className="space-y-3">
                                            {/* Thread ancestors */}
                                            {isX && threadAncestors.map((node, idx) => {
                                                const label = threadAncestors.length === 1
                                                    ? 'In Reply To'
                                                    : (idx === 0
                                                        ? 'Thread Root'
                                                        : (idx === threadAncestors.length - 1 ? 'In Reply To' : `Thread ${idx + 1}`));
                                                return renderContextTweet(node, label);
                                            })}

                                            {/* Reposted from */}
                                            {hasCtxReference(ctx.reposted_from) && renderContextTweet(ctx.reposted_from, 'Reposted From')}

                                            {/* Main Content */}
                                            <div>
                                                <h4 className="text-sm font-semibold text-slate-500 mb-2">
                                                    {isX && (threadParent || inReplyTo) ? 'Reply' : 'Content'}
                                                </h4>
                                                <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg text-sm whitespace-pre-wrap break-words border">
                                                    {selectedGrievance.content?.full_text || selectedGrievance.content?.text || 'No content'}
                                                </div>
                                            </div>

                                            {/* Main Media */}
                                            {selectedGrievance.content?.media?.length > 0 && (
                                                <div>
                                                    <h4 className="text-sm font-semibold text-slate-500 mb-2">Media ({selectedGrievance.content.media.length})</h4>
                                                    {renderDetailMedia(selectedGrievance.content.media, 'main')}
                                                </div>
                                            )}

                                            {/* Quoted tweet */}
                                            {quotedCtx && renderContextTweet(quotedCtx, 'Quoted Tweet')}
                                        </div>
                                    );
                                })()}

                                {/* Workflow History */}
                                {selectedGrievance.workflow_history?.length > 0 && (
                                    <div>
                                        <h4 className="text-sm font-semibold text-slate-500 mb-2">Workflow History</h4>
                                        <div className="space-y-2">
                                            {selectedGrievance.workflow_history.map((h, i) => (
                                                <div key={i} className="text-sm border-l-2 border-slate-300 dark:border-slate-600 pl-3 py-1.5">
                                                    <div className="flex justify-between items-baseline">
                                                        <span className="font-medium capitalize text-slate-700 dark:text-slate-300">{(h.to || '').replace(/_/g, ' ')}</span>
                                                        <span className="text-xs text-muted-foreground">{h.at ? format(new Date(h.at), 'MMM d, h:mm a') : ''}</span>
                                                    </div>
                                                    {h.from && <span className="text-xs text-muted-foreground">From: {(h.from || '').replace(/_/g, ' ')}</span>}
                                                    {h.note && <p className="text-slate-600 text-xs mt-1">{h.note}</p>}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Original URL / Reply */}
                                <div className="flex flex-wrap gap-2">
                                    {(selectedGrievance.tweet_url || selectedGrievance.url) && (
                                        <Button variant="outline" size="sm" className="gap-2" asChild>
                                            <a href={selectedGrievance.tweet_url || selectedGrievance.url} target="_blank" rel="noopener noreferrer">
                                                <ExternalLink className="h-4 w-4" /> View Original Post
                                            </a>
                                        </Button>
                                    )}

                                    {['x', 'twitter', 'facebook'].includes(String(selectedGrievance.platform || '').toLowerCase()) && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="gap-2"
                                            onClick={() => handleReplyCommentAction(selectedGrievance)}
                                        >
                                            <MessageSquare className="h-4 w-4" /> Reply / Comment
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </ScrollArea>
                    )}
                </DialogContent>
            </Dialog>

            {/* Fullscreen Media Preview */}
            <Dialog open={isMediaOpen} onOpenChange={setIsMediaOpen} modal={false}>
                <DialogContent
                    className="w-[100vw] h-[100vh] max-w-none p-0 bg-black/95 border-none rounded-none [&>button]:hidden"
                    onOpenAutoFocus={(e) => e.preventDefault()}
                    onCloseAutoFocus={(e) => e.preventDefault()}
                >
                    <div className="w-full h-full flex items-center justify-center relative">
                        <button
                            type="button"
                            onClick={() => setIsMediaOpen(false)}
                            className="absolute top-4 right-4 z-50 rounded-full bg-black/50 p-2 text-white hover:bg-white/20 transition-colors"
                            aria-label="Close preview"
                        >
                            <X className="h-6 w-6" />
                        </button>
                        {selectedPreviewMedia ? (
                            selectedMediaIsVideo ? (
                                <VideoPlayer
                                    url={getProxiedMediaUrl(selectedPreviewMedia.video_url || selectedPreviewMedia.url)}
                                    preview={getProxiedMediaUrl(selectedPreviewMedia.preview_url || selectedPreviewMedia.preview)}
                                    type={selectedPreviewMedia.type}
                                    autoPlay={String(selectedPreviewMedia.type || '').toLowerCase() === 'animated_gif'}
                                    onError={(e) => {
                                        console.error('Video playback error:', e);
                                        toast.error('Failed to load video.');
                                    }}
                                />
                            ) : (
                                <img
                                    src={getProxiedMediaUrl(selectedPreviewMedia.url || selectedPreviewMedia.preview_url || selectedPreviewMedia.preview)}
                                    alt="Media"
                                    className="max-w-full max-h-full object-contain"
                                    referrerPolicy="no-referrer"
                                />
                            )
                        ) : null}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Reply / Comment Internal Dialog */}
            <Dialog open={replyCommentDialog.open} onOpenChange={(open) => { if (!open) setReplyCommentDialog({ open: false, grievance: null, message: '', submitting: false }); }}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <MessageSquare className="h-5 w-5" /> Reply to User
                        </DialogTitle>
                        <DialogDescription>
                            Write your reply message. It will be saved to the communication log and then the {String(replyCommentDialog.grievance?.platform || 'X').toUpperCase()} reply window will open with the message pre-filled.
                        </DialogDescription>
                    </DialogHeader>
                    {replyCommentDialog.grievance && (
                        <div className="space-y-4 py-2">
                            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 text-sm border">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-semibold text-slate-400">Replying to</span>
                                    <span className="text-xs font-medium text-slate-700">@{(replyCommentDialog.grievance.posted_by?.handle || '').replace('@', '')}</span>
                                </div>
                                <p className="text-slate-600 text-xs line-clamp-3">{replyCommentDialog.grievance.content?.full_text || replyCommentDialog.grievance.content?.text || ''}</p>
                            </div>
                            <div className="space-y-2">
                                <Label>Your Reply Message</Label>
                                <Textarea
                                    placeholder="Type your reply message here..."
                                    value={replyCommentDialog.message}
                                    onChange={(e) => setReplyCommentDialog(prev => ({ ...prev, message: e.target.value }))}
                                    rows={4}
                                    autoFocus
                                />
                            </div>
                            {replyCommentDialog.grievance.grievance_workflow?.report_id && (
                                <p className="text-[11px] text-emerald-600 flex items-center gap-1">
                                    <CheckCircle2 className="h-3 w-3" /> This reply will be logged as: Operator({userName}) → User
                                </p>
                            )}
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setReplyCommentDialog({ open: false, grievance: null, message: '', submitting: false })}>Cancel</Button>
                        <Button
                            onClick={handleReplyCommentSubmit}
                            disabled={replyCommentDialog.submitting || !replyCommentDialog.message.trim()}
                        >
                            {replyCommentDialog.submitting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</> : 'Submit & Open Reply'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {socialActionOverlay.visible && (
                <div className="fixed inset-0 z-[10050] bg-black/60 flex items-center justify-center p-4">
                    <div className="w-full max-w-xl rounded-xl border border-slate-200 dark:border-slate-700 bg-white p-5 shadow-2xl">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900">Complete your action</h3>
                                <p className="mt-1 text-sm text-slate-600">
                                    {socialActionOverlay.instruction || 'We opened the social composer in a separate browser window.'}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">After posting, close that popup window and click Done.</p>
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                onClick={() => handleCloseSocialActionOverlay(true)}
                                title="Close"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>

                        <div className="mt-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 px-3 py-2 text-xs text-slate-600 break-all">
                            {socialActionOverlay.url}
                        </div>

                        <p className="mt-3 text-xs text-slate-500">
                            {socialActionOverlay.popupBlocked
                                ? 'Popup was blocked by browser settings. Click Open Popup Window again after allowing popups.'
                                : socialActionOverlay.composerOpened
                                    ? 'Composer opened successfully. Finish on platform and come back.'
                                    : 'Click Open Popup Window to continue in a popup window.'}
                        </p>

                        <div className="mt-4 flex items-center justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-2"
                                onClick={handleOpenSocialActionInNewTab}
                            >
                                <ExternalLink className="h-4 w-4" /> Open Popup Window
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                className="gap-2"
                                onClick={() => handleCloseSocialActionOverlay(true)}
                            >
                                <CheckCircle2 className="h-4 w-4" /> Done
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

/* ─── Source Card Sub-component ─── */
const SourceCard = ({ source, fetching, onFetch, onDelete, onEdit }) => (
    <Card className="border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-500 transition-colors">
        <CardContent className="p-3">
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar className="h-9 w-9 shrink-0">
                        <AvatarImage src={source.profile_image_url} />
                        <AvatarFallback className="text-xs bg-slate-200 dark:bg-slate-700 dark:text-slate-100">
                            {(source.handle || '?').replace('@', '')[0]?.toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                        <div className="flex items-center gap-1">
                            <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                                {source.display_name || source.handle}
                            </span>
                            {source.is_verified && <BadgeCheck className="h-3.5 w-3.5 text-blue-500 shrink-0" />}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{source.handle}</div>
                    </div>
                </div>
            </div>
            <div className="mt-2.5 flex items-center justify-end">
                <div className="flex items-center gap-1">
                    {onEdit ? (
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onEdit} title="Edit source">
                            <Pencil className="h-3.5 w-3.5" />
                        </Button>
                    ) : null}
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={onDelete} title="Remove source">
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>
        </CardContent>
    </Card>
);

/* ─── Detail Info Field ─── */
const InfoField = ({ label, value }) => (
    <div>
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">{label}</h4>
        <div className="text-sm text-slate-800">{value}</div>
    </div>
);

/* ─── Resizable/Draggable Excel Sheet Modal ─── */
const ExcelSheetModal = ({ open, onOpenChange, rows, setRows, modalPos, setModalPos, modalSize, setModalSize, isDragging, setIsDragging, dragOffset, setDragOffset, isResizing, setIsResizing, modalRef, preFilledRow, setPreFilledRow, userName }) => {
    // Dropdown options
    const psJurisdictionOptions = [
        'PS-01', 'PS-02', 'PS-03', 'PS-04', 'PS-05', 'PS-06', 'PS-07', 'PS-08', 'PS-09', 'PS-10'
    ];
    const typeOfPostOptions = [
        'Twitter/X Post', 'Facebook Post', 'Instagram Post', 'WhatsApp Message', 'Comment', 'Story', 'Other'
    ];
    const subCategoryOptions = [
        'Complaint', 'Suggestion', 'Appreciation', 'Query', 'Feedback', 'Report', 'Other'
    ];
    const actionTakenOptions = [
        'Forwarded', 'Suggested', 'Solved'
    ];
    const informedToOptions = [
        { label: 'Police Station', phone: '100' },
        { label: 'Fire Department', phone: '101' },
        { label: 'Ambulance', phone: '102' },
        { label: 'Disaster Management', phone: '108' },
        { label: 'Women Helpline', phone: '1091' },
        { label: 'Custom Contact', phone: '' }
    ];

    const [searchInputs, setSearchInputs] = useState({});

    const addRow = () => {
        const newId = Math.max(...rows.map(r => r.id), 0) + 1;
        const now = new Date().toISOString().slice(0, 16);

        // If we have pre-filled data, use it
        const newRow = {
            id: newId,
            uniqueNumber: `UNQ-${String(newId).padStart(3, '0')}`,
            callerNumber: preFilledRow?.callerNumber || '',
            receivedBy: userName,
            mentionName: preFilledRow?.mentionName || '',
            receivedTime: preFilledRow?.receivedTime || now,
            contents: preFilledRow?.contents || '',
            psJurisdiction: '',
            typeOfPost: '',
            subCategory: '',
            informedTo: '',
            actionTime: '',
            actionTaken: '',
            caseDetails: '',
            actionInformedTo: '',
            completionDate: '',
        };

        setRows([...rows, newRow]);
        setPreFilledRow(null); // Clear pre-filled data after use
    };

    const updateRow = (id, field, value) => {
        setRows(rows.map(r => r.id === id ? { ...r, [field]: value } : r));
    };

    const deleteRow = (id) => {
        setRows(rows.filter(r => r.id !== id));
    };

    const exportToCSV = () => {
        const headers = ['Unique Number', 'Caller Number', 'Received By', 'Mention Name', 'Received Time & Date',
            'Contents of Complaint', 'PS Jurisdiction', 'Type of Post', 'Sub Category', 'Informed To',
            'Action Time', 'Action Taken', 'Case Details', 'Action Informed To', 'Completion Date'];
        const csvContent = [
            headers.join(','),
            ...rows.map(r => [
                r.uniqueNumber, r.callerNumber, r.receivedBy, r.mentionName, r.receivedTime,
                r.contents, r.psJurisdiction, r.typeOfPost, r.subCategory, r.informedTo,
                r.actionTime, r.actionTaken, r.caseDetails, r.actionInformedTo, r.completionDate
            ].map(v => `"${(v || '').replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `grievance_records_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    };

    if (!open) return null;

    return (
        <div
            ref={modalRef}
            className="fixed bg-white rounded-lg shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col z-50"
            style={{
                left: `${modalPos.x}px`,
                top: `${modalPos.y}px`,
                width: `${modalSize.width}px`,
                height: `${modalSize.height}px`,
            }}
        >
            {/* Title Bar - Draggable */}
            <div
                className="flex items-center justify-between p-3 bg-gradient-to-r from-slate-100 to-slate-50 border-b border-slate-200 dark:border-slate-700 rounded-t-lg cursor-move hover:bg-slate-100 transition-colors select-none"
                onMouseDown={(e) => {
                    if (!modalRef.current) return;
                    const rect = modalRef.current.getBoundingClientRect();
                    setDragOffset({
                        x: e.clientX - rect.left,
                        y: e.clientY - rect.top,
                    });
                    setIsDragging(true);
                }}
            >
                <div>
                    <h2 className="font-semibold text-slate-900">Grievance Records - Excel Sheet</h2>
                    <p className="text-xs text-slate-500">Manage and export grievance complaint records</p>
                </div>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onOpenChange(false)}>
                    <X className="h-4 w-4" />
                </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto">
                <table className="w-full border-collapse text-xs">
                    <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
                        <tr>
                            <th className="border p-2 text-left bg-slate-200 font-semibold w-16">Unique #</th>
                            <th className="border p-2 text-left bg-slate-200 font-semibold min-w-20">Caller #</th>
                            <th className="border p-2 text-left bg-slate-200 font-semibold min-w-20">Received By</th>
                            <th className="border p-2 text-left bg-slate-200 font-semibold min-w-20">Mention</th>
                            <th className="border p-2 text-left bg-slate-200 font-semibold min-w-24">Rcv Time</th>
                            <th className="border p-2 text-left bg-slate-200 font-semibold min-w-28">Contents</th>
                            <th className="border p-2 text-left bg-slate-200 font-semibold min-w-16">PS</th>
                            <th className="border p-2 text-left bg-slate-200 font-semibold min-w-16">Type</th>
                            <th className="border p-2 text-left bg-slate-200 font-semibold min-w-16">SubCat</th>
                            <th className="border p-2 text-left bg-slate-200 font-semibold min-w-16">Inform To</th>
                            <th className="border p-2 text-left bg-slate-200 font-semibold min-w-20">Action Time</th>
                            <th className="border p-2 text-left bg-slate-200 font-semibold min-w-16">Action</th>
                            <th className="border p-2 text-left bg-slate-200 font-semibold min-w-24">Details</th>
                            <th className="border p-2 text-left bg-slate-200 font-semibold min-w-16">Inf To</th>
                            <th className="border p-2 text-left bg-slate-200 font-semibold min-w-16">Complete</th>
                            <th className="border p-2 text-center bg-slate-200 font-semibold w-10">Del</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                                <td className="border p-1"><span className="font-mono text-[10px]">{row.uniqueNumber}</span></td>
                                <td className="border p-1"><Input value={row.callerNumber} onChange={(e) => updateRow(row.id, 'callerNumber', e.target.value)} className="h-6 text-xs p-1" placeholder="+91..." /></td>
                                <td className="border p-1"><Input value={row.receivedBy} readOnly className="h-6 text-xs p-1 bg-slate-100 dark:bg-slate-800" title="Auto-filled from login" /></td>
                                <td className="border p-1"><Input value={row.mentionName} onChange={(e) => updateRow(row.id, 'mentionName', e.target.value)} className="h-6 text-xs p-1" placeholder="Victim name" /></td>
                                <td className="border p-1"><Input type="datetime-local" value={row.receivedTime} readOnly className="h-6 text-xs p-1 bg-slate-100 dark:bg-slate-800" title="Auto-filled" /></td>
                                <td className="border p-1"><textarea value={row.contents} readOnly className="w-full h-6 text-xs border rounded p-1 resize-none bg-slate-100 dark:bg-slate-800" title="Auto-filled from post" /></td>
                                <td className="border p-1">
                                    <select value={row.psJurisdiction} onChange={(e) => updateRow(row.id, 'psJurisdiction', e.target.value)} className="h-6 text-xs w-full p-1 border rounded">
                                        <option value="">Select PS</option>
                                        {psJurisdictionOptions.map(ps => <option key={ps} value={ps}>{ps}</option>)}
                                        <option value="other">Other</option>
                                    </select>
                                </td>
                                <td className="border p-1">
                                    <select value={row.typeOfPost} onChange={(e) => updateRow(row.id, 'typeOfPost', e.target.value)} className="h-6 text-xs w-full p-1 border rounded">
                                        <option value="">Type</option>
                                        {typeOfPostOptions.map(type => <option key={type} value={type}>{type}</option>)}
                                    </select>
                                </td>
                                <td className="border p-1">
                                    <select value={row.subCategory} onChange={(e) => updateRow(row.id, 'subCategory', e.target.value)} className="h-6 text-xs w-full p-1 border rounded">
                                        <option value="">SubCat</option>
                                        {subCategoryOptions.map(sub => <option key={sub} value={sub}>{sub}</option>)}
                                    </select>
                                </td>
                                <td className="border p-1">
                                    <select value={row.informedTo} onChange={(e) => updateRow(row.id, 'informedTo', e.target.value)} className="h-6 text-xs w-full p-1 border rounded">
                                        <option value="">Select</option>
                                        {informedToOptions.map(opt => <option key={opt.phone} value={opt.phone}>{opt.label} ({opt.phone})</option>)}
                                    </select>
                                </td>
                                <td className="border p-1"><Input type="datetime-local" value={row.actionTime} onChange={(e) => updateRow(row.id, 'actionTime', e.target.value)} className="h-6 text-xs p-1" /></td>
                                <td className="border p-1">
                                    <select value={row.actionTaken} onChange={(e) => updateRow(row.id, 'actionTaken', e.target.value)} className="h-6 text-xs w-full p-1 border rounded">
                                        <option value="">Action</option>
                                        {actionTakenOptions.map(action => <option key={action} value={action}>{action}</option>)}
                                    </select>
                                </td>
                                <td className="border p-1"><textarea value={row.caseDetails} onChange={(e) => updateRow(row.id, 'caseDetails', e.target.value)} className="w-full h-6 text-xs border rounded p-1 resize-none" placeholder="Details..." /></td>
                                <td className="border p-1"><Input value={row.actionInformedTo} onChange={(e) => updateRow(row.id, 'actionInformedTo', e.target.value)} className="h-6 text-xs p-1" placeholder="Complainant" /></td>
                                <td className="border p-1"><Input type="date" value={row.completionDate} onChange={(e) => updateRow(row.id, 'completionDate', e.target.value)} className="h-6 text-xs p-1" /></td>
                                <td className="border p-1 text-center"><Button variant="destructive" size="sm" onClick={() => deleteRow(row.id)} className="h-5 w-5 p-0"><X className="h-3 w-3" /></Button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-3 bg-slate-50 border-t border-slate-200 dark:border-slate-700 rounded-b-lg gap-2">
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={addRow} className="gap-1 text-xs h-7"><Plus className="h-3 w-3" />Add Row</Button>
                    <Button variant="outline" size="sm" onClick={exportToCSV} className="gap-1 text-xs h-7"><Download className="h-3 w-3" />Export CSV</Button>
                </div>
                <span className="text-xs text-slate-500">Drag title to move, resize from corner</span>
            </div>

            {/* Resize Handle */}
            <div
                className="absolute bottom-0 right-0 w-6 h-6 cursor-se-resize bg-gradient-to-tl from-slate-300 to-transparent rounded-tl hover:from-slate-400 transition-colors"
                onMouseDown={() => setIsResizing(true)}
                title="Drag to resize"
            />
        </div>
    );
};

export default Grievances;
