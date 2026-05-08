import React, { useState } from 'react';
import ClaimMap from '../components/Map/ClaimMap';
import FilterPanel from '../components/Map/FilterPanel';
import ClaimDetailPanel from '../components/Claims/ClaimDetailPanel';

export default function MapPage() {
  const [filters, setFilters] = useState({});
  const [selectedClaim, setSelectedClaim] = useState(null);

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      <ClaimMap
        filters={filters}
        onFeatureClick={(props) => setSelectedClaim(props)}
      />
      <FilterPanel
        filters={filters}
        onChange={setFilters}
        onReset={() => setFilters({})}
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
