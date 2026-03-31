describe('add new quiz worflow', { testIsolation: false }, () => {
  it('home page should not have any quiz', () => {
    cy.visit('/');
    cy.contains('No quiz created yet').should('exist');
  });
  it('should open quiz creation modal on clicking the Create your first one link', () => {
    cy.contains('Create your first one').click();
    cy.findByRole('banner')
      .findByLabelText('Enter the quiz title')
      .should('have.attr', 'placeholder', 'Guess the capital city');
  });
  it('should have the confirm button disabled when the title is empty', () => {
    cy.findByRole('banner')
      .find('[data-testid="confirm-create-quiz-button"]')
      .find('button')
      .should('be.disabled');

    cy.findByRole('banner')
      .findByLabelText('Enter the quiz title')
      .type('My first quiz');
    cy.findByRole('banner')
      .find('[data-testid="confirm-create-quiz-button"]')
      .find('button')
      .should('not.be.disabled');
  });
  it('should be possible to add a description', () => {
    cy.findByLabelText('Enter the quiz description').type(
      'My first quiz description'
    );
  });
  it('should create the quiz on confirming the modal', () => {
    cy.findByRole('banner')
      .find('[data-testid="confirm-create-quiz-button"]')
      .click();
    cy.contains('No quiz created yet').should('not.exist');
    cy.contains('My first quiz').should('exist');
  });
});
