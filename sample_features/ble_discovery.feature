@smoke @ble
Feature: BLE Device Discovery
    As a user
    I want to discover BLE devices
    So that I can connect to them

    @runme @quick
    Scenario: Discover nearby BLE devices
        Given BLE is enabled on the mobile device
        When I start scanning for devices
        Then I should see a list of available devices
        And each device should show its name and signal strength

    @filter
    Scenario: Filter devices by name
        Given BLE is enabled on the mobile device
        And I have set a name filter to "MyDevice"
        When I start scanning for devices
        Then I should only see devices with "MyDevice" in their name

    @pairing @critical
    Scenario: Pair with a BLE device
        Given BLE is enabled on the mobile device
        And I have discovered a device named "TestDevice"
        When I select the device for pairing
        And I confirm the pairing code
        Then the device should be paired successfully
        And I should see the device in my paired devices list
