import { Box, Stack } from '@mui/material';
import Breadcrumb from './Breadcrumb.jsx';
import StatsCard from './StatsCard.jsx';
import TableTabs from './TableTabs.jsx';

/**
 * The layout every list screen shares, in four bands:
 *
 *   1. breadcrumb  — Back, the trail, and the page's actions
 *   2. tabs        — the status strip, with the page's search on the right
 *   3. cards       — the figures, in one scrollable row
 *   4. content     — the table
 *
 * Ported from Zentory's `ListPageShell`, band for band, including the order.
 * The order is not arbitrary: tabs come before the figures because the tabs
 * change what the figures count, and a control that sits below the number it
 * governs reads as unrelated to it.
 *
 * The cards scroll sideways rather than wrapping. Six figures wrapping onto a
 * second line pushes the table down by the height of a whole band, on exactly
 * the narrow screens that can least afford it.
 *
 *     <ListPageShell
 *       breadcrumb={{ backPath: '/', items: [{ label: 'Branches', active: true }], actions: <Buttons /> }}
 *       tabs={{ tabs, value, onChange }}
 *       cards={[{ key: 'total', label: 'Branches', value: 4, icon: <StoreIcon />, tone: 'primary' }]}
 *     >
 *       <DataTable … />
 *     </ListPageShell>
 */
export default function ListPageShell({ breadcrumb, tabs, cards, children }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        flex: 1,
        // Cancels the page padding the app layout puts around every route, so a
        // list screen runs to the edges the way Zentory's does. Without this the
        // table carries 24px from the layout plus 16px of its own on each side,
        // and 40px of blank margin on a wide table is a column of data that had
        // to be scrolled to instead.
        //
        // Desktop only: the layout's bottom padding on mobile clears the fixed
        // bottom navigation, and cancelling that would tuck the last row behind
        // it.
        mx: { sm: -2 },
        mt: { sm: -1.5 },
        mb: { sm: -1.5 },
      }}
    >
      {breadcrumb && (
        <Breadcrumb
          backPath={breadcrumb.backPath}
          onBack={breadcrumb.onBack}
          items={breadcrumb.items}
          actions={breadcrumb.actions}
        />
      )}

      {tabs && (
        <TableTabs
          tabs={tabs.tabs}
          value={tabs.value}
          onChange={tabs.onChange}
          searchValue={tabs.searchValue}
          onSearchChange={tabs.onSearchChange}
          searchPlaceholder={tabs.searchPlaceholder}
        />
      )}

      {cards?.length > 0 && (
        <Box
          sx={{
            px: 1.25, pt: 1, pb: 0.75,
            overflowX: 'auto',
            '&::-webkit-scrollbar': { display: 'none' },
            scrollbarWidth: 'none',
          }}
        >
          <Stack direction="row" alignItems="stretch" gap={1.5} sx={{ minWidth: 'max-content' }}>
            {cards.map((card) => (
              <StatsCard
                key={card.key ?? card.label}
                title={card.label ?? card.title}
                value={card.value}
                detail={card.detail}
                icon={card.icon}
                gradient={card.tone ?? card.gradient}
                onClick={card.onClick}
                active={card.active}
              />
            ))}
          </Stack>
        </Box>
      )}

      {/* Fills whatever height is left so a short table does not leave a band of
          empty page under it. The table stretches into it when the page asks
          for ; otherwise this simply collapses. */}
      <Box
        sx={{
          flex: 1, minHeight: 0, px: 1.25, pb: 1.25,
          display: 'flex', flexDirection: 'column',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
