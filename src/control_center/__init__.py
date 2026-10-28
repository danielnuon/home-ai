"""Brain, the Control Center (spec component C14).

Brain shows the state of every platform component and forwards the Owner's actions. It decides
nothing itself: approvals, controls and settings go to the approval gate, Owner commands go to the
pipeline engine (spec 7.1, principle 3). Until the hardware exists, every one of those services is a
mock behind the interfaces in `control_center.backends.protocols`.
"""
