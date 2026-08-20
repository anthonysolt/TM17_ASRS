'use client';

const STEPS = [
  { label: 'Configuration', icon: '1' },
  { label: 'Analysis', icon: '2' },
  { label: 'Preview & Generate', icon: '3' },
];

export default function StepIndicator({ currentStep }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0',
      marginBottom: '2rem',
      flexWrap: 'wrap',
    }}>
      {STEPS.map((step, index) => {
        const isDone = index < currentStep;
        const isActive = index === currentStep;
        const isPending = index > currentStep;

        const circleColor = isDone
          ? 'var(--color-success, #16a34a)'
          : isActive
            ? 'var(--color-asrs-orange)'
            : 'var(--color-bg-tertiary)';

        const textColor = isDone
          ? 'var(--color-success, #16a34a)'
          : isActive
            ? 'var(--color-asrs-orange)'
            : 'var(--color-text-light)';

        return (
          <div key={index} style={{ display: 'flex', alignItems: 'center' }}>
            {/* Step circle + label */}
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              minWidth: '70px',
            }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%',
                backgroundColor: (isDone || isActive) ? circleColor : 'transparent',
                border: `2px solid ${circleColor}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.8rem', fontWeight: '700',
                color: (isDone || isActive) ? '#fff' : 'var(--color-text-light)',
                transition: 'all 0.2s ease',
              }}>
                {isDone ? '✓' : step.icon}
              </div>
              <span style={{
                fontSize: '0.7rem', fontWeight: isActive ? '700' : '500',
                color: textColor, marginTop: '0.3rem',
                textTransform: 'uppercase', letterSpacing: '0.03em',
              }}>
                {step.label}
              </span>
            </div>

            {/* Connector line between steps */}
            {index < STEPS.length - 1 && (
              <div style={{
                width: '40px', height: '2px',
                backgroundColor: isDone ? 'var(--color-success, #16a34a)' : 'var(--color-bg-tertiary)',
                margin: '0 0.25rem', marginBottom: '1.2rem',
                transition: 'background-color 0.2s ease',
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
