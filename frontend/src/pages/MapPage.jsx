import React, { useState } from 'react';
import ClaimMap from '../components/Map/ClaimMap';
import FilterPanel from '../components/Map/FilterPanel';
import ClaimDetailPanel from '../components/Claims/ClaimDetailPanel';

const DEFAULT_FILTERS = {};

export default function MapPage() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(DEFAULT_FILTERS);
  const [selectedClaim, setSelectedClaim] = useState(null);

  const handleApply = () => setAppliedFilters({ ...filters });
  const handleReset = () => {
    setFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
  };

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      <ClaimMap
        filters={appliedFilters}
        onFeatureClick={(props) => setSelectedClaim(props)}
      />
      <FilterPanel
        filters={filters}
        onChange={setFilters}
        onApply={handleApply}
        onReset={handleReset}
      />
      {selectedClaim && (
        <ClaimDetailPanel
          claim={selectedClaim}
          onClose={() => setSelectedClaim(null)}
        />
      )}
    </div>
  );
}
