@smoke @shopping
Feature: Fruit Shopping Cart
    As a customer
    I want to add fruits to my shopping cart
    So that I can purchase them

    Background:
        Given I am logged into the store
        And my shopping cart is empty

    @critical @runme
    Scenario: Add apple to cart
        Given apples are in stock
        When I add 3 apples to my cart
        Then my cart should contain 3 apples
        And the total price should be updated

    @regression
    Scenario: Add multiple fruits to cart
        Given apples are in stock
        And bananas are in stock
        When I add 2 apples to my cart
        And I add 5 bananas to my cart
        Then my cart should contain 7 items
        And the cart summary should show both fruits

    @edge_case
    Scenario Outline: Add fruits with different quantities
        Given <fruit> is in stock
        And the price per unit is <price>
        When I add <quantity> <fruit> to my cart
        Then the subtotal should be <total>

        Examples:
            | fruit   | price | quantity | total |
            | apple   | 1.50  | 4        | 6.00  |
            | banana  | 0.75  | 6        | 4.50  |
            | orange  | 2.00  | 3        | 6.00  |
            | mango   | 3.00  | 2        | 6.00  |

    @ignore
    Scenario: Add out of stock fruit
        Given apples are out of stock
        When I try to add apples to my cart
        Then an error message should be displayed
