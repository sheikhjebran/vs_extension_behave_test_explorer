@smoke @vegetables
Feature: Vegetable Inventory
    As a store manager
    I want to manage vegetable inventory
    So that I can track stock levels

    @runme @quick
    Scenario: View available vegetables
        Given the inventory system is running
        When I view the vegetable section
        Then I should see a list of available vegetables
        And each vegetable should show its name and quantity

    @filter
    Scenario: Filter vegetables by category
        Given the inventory system is running
        And I have set a category filter to "leafy greens"
        When I search for vegetables
        Then I should only see vegetables in the "leafy greens" category

    @checkout @critical
    Scenario: Purchase vegetables
        Given the inventory system is running
        And I have added carrots to my basket
        When I proceed to checkout
        And I confirm the payment
        Then the purchase should be completed successfully
        And I should see the vegetables in my order history
