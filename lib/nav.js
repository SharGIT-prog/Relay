export const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: 'layout', group: 'Plan',
    desc: 'Transition readiness per patient: outstanding requirements, resources and handoff state.' },
  { href: '/discharge-plans/new', match: '/discharge-plans', label: 'Discharge', icon: 'clipboard', group: 'Plan',
    desc: 'Plan a discharge, define what must be in place, and move it to ready.' },
  { href: '/resources', label: 'Resources', icon: 'box', group: 'Resources',
    desc: 'Browse beds, equipment and services, and see what is free in a time window.' },
  { href: '/allocations', label: 'Allocate', icon: 'trend', group: 'Resources',
    desc: 'Book a free resource for a requirement without double-booking, and complete or cancel bookings.' },
  { href: '/recovery', label: 'Recovery', icon: 'activity', group: 'Care',
    desc: 'Track a patient\'s continuing recovery episodes and the requirements tied to them.' },
  { href: '/handoffs', label: 'Handoffs', icon: 'send', group: 'Care',
    desc: 'Prepare, send and acknowledge the formal transfer of care to the next facility.' },
];