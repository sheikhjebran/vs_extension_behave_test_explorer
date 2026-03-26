@smoke @cellular
Feature: Cellular Connection
    As a user
    I want to establish cellular connections
    So that I can communicate with the device

    Background:
        Given the device is powered on
        And the cellular module is initialized

    @critical @runme
    Scenario: Successful cellular connection
        Given the SIM card is inserted
        When I initiate a cellular connection
        Then the connection should be established
        And the signal strength should be above 50%

    @regression
    Scenario: Connection retry on failure
        Given the SIM card is inserted
        And the network is temporarily unavailable
        When I initiate a cellular connection
        Then the system should retry 3 times
        And eventually establish the connection

    @edge_case
    Scenario Outline: Connection with different signal strengths
        Given the SIM card is inserted
        And the signal strength is <signal>%
        When I initiate a cellular connection
        Then the connection result should be <result>

        Examples:
            | signal | result     |
            | 80     | success    |
            | 50     | success    |
            | 20     | degraded   |
            | 5      | failed     |

    @ignore
    Scenario: Connection without SIM card
        Given no SIM card is inserted
        When I initiate a cellular connection
        Then an error message should be displayed
