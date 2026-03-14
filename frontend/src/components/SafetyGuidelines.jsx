// src/components/SafetyGuidelines.jsx
import React from 'react';
import './SafetyGuidelines.css';

const SafetyGuidelines = ({ 
  disasterType, 
  isVisible = false,
  onClose 
}) => {
  if (!isVisible || !disasterType) return null;

  const earthquakeGuidelines = [
    { icon: '⬇️', text: 'DROP to your hands and knees', detail: 'This position prevents you from being knocked down and allows you to stay low and crawl to shelter.' },
    { icon: '🛡️', text: 'COVER your head and neck', detail: 'Take cover under a sturdy table or desk. If none is available, cover your head and neck with your arms and crouch in an inside corner of the building.' },
    { icon: '🤝', text: 'HOLD ON until shaking stops', detail: 'Hold on to your shelter with one hand and be ready to move with it if it shifts.' },
    { icon: '🪟', text: 'Stay away from windows', detail: 'Glass shatters during earthquakes and can cause severe injuries. Avoid exterior walls if possible.' },
    { icon: '🚪', text: 'Avoid doorways', detail: 'Doorways are no stronger than other parts of the house and do not provide protection from falling debris.' },
    { icon: '🏃', text: 'Do not run outside', detail: 'Injury occurs when people run outside and are hit by falling debris. Stay inside until shaking stops.' },
    { icon: '⚡', text: 'Turn off gas if you smell it', detail: 'If you smell gas after an earthquake, turn it off at the main valve and leave the building immediately.' },
    { icon: '📱', text: 'Use text messages', detail: 'Text messages require less bandwidth than calls and are more likely to go through when networks are congested.' }
  ];

  const floodGuidelines = [
    { icon: '⬆️', text: 'Move to higher ground immediately', detail: 'If you are in a flood-prone area, move to the highest floor or rooftop. Do not wait for instructions.' },
    { icon: '⚡', text: 'Avoid electrical equipment', detail: 'Do not touch electrical equipment if you are wet or standing in water. Turn off electricity at the main breaker if you can do so safely.' },
    { icon: '🚗', text: 'Never drive through floodwater', detail: 'Just 30cm (12 inches) of water can float a car. 60cm (2 feet) of rushing water can carry away most vehicles, including SUVs and trucks.' },
    { icon: '🌊', text: 'Avoid walking through moving water', detail: '15cm (6 inches) of moving water can knock you down. If you must walk in water, use a stick to check ground stability.' },
    { icon: '🏠', text: 'Evacuate when instructed', detail: 'Follow evacuation orders immediately. Delaying can put you and emergency responders at risk.' },
    { icon: '💧', text: 'Avoid floodwater contact', detail: 'Floodwater often contains sewage, chemicals, and debris. It may also be electrically charged from downed power lines.' },
    { icon: '📻', text: 'Stay informed via radio', detail: 'Use battery-powered radio for updates. Cell networks may be down or overloaded.' },
    { icon: '🏥', text: 'Check for injuries after water recedes', detail: 'Once safe, check yourself and others for injuries. Seek medical attention for cuts that may become infected.' }
  ];

  const guidelines = disasterType === 'earthquake' ? earthquakeGuidelines : floodGuidelines;
  const disasterName = disasterType === 'earthquake' ? 'Earthquake' : 'Flood';
  const disasterIcon = disasterType === 'earthquake' ? '🌋' : '🌊';

  return (
    <div className="safety-guidelines-panel">
      <div className="guidelines-header">
        <div className="header-left">
          <span className="disaster-icon-large">{disasterIcon}</span>
          <div className="header-text">
            <h3>{disasterName} Safety Guidelines</h3>
            <p className="subtitle">What to do during a real {disasterName.toLowerCase()}</p>
          </div>
        </div>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>

      <div className="guidelines-content">
        <div className="emergency-alert">
          <div className="alert-text">
            <strong>EMERGENCY PROTOCOL:</strong> Follow these steps in order for maximum safety
          </div>
        </div>

        <div className="guidelines-steps">
          {guidelines.map((guideline, index) => (
            <div key={index} className="guideline-step">
              <div className="step-number">{index + 1}</div>
              <div className="step-content">
                <div className="step-header">
                  <span className="step-icon">{guideline.icon}</span>
                  <span className="step-title">{guideline.text}</span>
                </div>
                <div className="step-detail">{guideline.detail}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="additional-info">
          <div className="info-box warning">
            <h4>Important Warnings</h4>
            <ul>
              {disasterType === 'earthquake' ? (
                <>
                  <li>Aftershocks may occur for hours or days after the main earthquake - be prepared</li>
                  <li>Check for gas leaks before using lighters, matches, or electrical switches</li>
                  <li>Expect utility outages including water, electricity, and gas for several days</li>
                  <li>Be prepared for landslides if you are in a mountainous area</li>
                </>
              ) : (
                <>
                  <li>Floodwaters may continue rising for hours after rain has stopped</li>
                  <li>Roads and bridges may be damaged or completely washed away</li>
                  <li>Drinking water may be contaminated - boil or treat before drinking</li>
                  <li>Beware of wild animals, especially snakes, that may have entered buildings</li>
                </>
              )}
            </ul>
          </div>

          <div className="info-box emergency">
            <h4>Emergency Contacts</h4>
            <div className="contacts">
              <div className="contact-item">
                <span className="contact-icon">📞</span>
                <span className="contact-text">112 - Emergency Services</span>
              </div>
              <div className="contact-item">
                <span className="contact-icon">📻</span>
                <span className="contact-text">FM 88.5 - Emergency Broadcast</span>
              </div>
              <div className="contact-item">
                <span className="contact-icon">🏠</span>
                <span className="contact-text">Local Emergency Management: 1129</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="guidelines-footer">
        <p className="disclaimer">
          <strong>Disclaimer:</strong> This is a training simulation. In a real emergency, follow instructions from local authorities.
          These guidelines are based on FEMA and International Red Cross recommendations.
        </p>
      </div>
    </div>
  );
};

export default SafetyGuidelines;