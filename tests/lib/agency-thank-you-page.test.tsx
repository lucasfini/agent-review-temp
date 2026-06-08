import { renderToStaticMarkup } from 'react-dom/server';

import AgencyThankYouPage from '@/app/agency/thank-you/page';

describe('agency thank-you page', () => {
  it('renders clear public next steps without internal links', () => {
    const markup = renderToStaticMarkup(<AgencyThankYouPage />);

    expect(markup).toContain('Agency inquiry received.');
    expect(markup).toContain('We review the inquiry for fit and useful context.');
    expect(markup).toContain('No account, portal, or client record was created by this form.');
    expect(markup).toContain('Review the process');
    expect(markup).toContain('See services');
    expect(markup).not.toContain('/dashboard');
  });
});
